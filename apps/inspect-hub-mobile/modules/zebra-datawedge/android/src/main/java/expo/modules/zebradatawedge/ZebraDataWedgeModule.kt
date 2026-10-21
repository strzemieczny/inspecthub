package expo.modules.zebradatawedge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class ZebraDataWedgeModule : Module() {
  private val scanAction = "com.inspecthub.mobile.SCAN"
  private val resultAction = "com.symbol.datawedge.api.RESULT_ACTION"
  private var observing = false
  private var registeredContext: Context? = null
  private val handler = Handler(Looper.getMainLooper())
  private var configurationId: String? = null
  private var verifying = false
  private var configurationResult = "UNKNOWN"
  private var configurationDetails = ""
  private val configurationTimeout = Runnable {
    finishConfiguration("TIMEOUT", listOf(configurationDetails, "DATAWEDGE_RESPONSE_TIMEOUT")
      .filter { it.isNotBlank() }.joinToString("; "))
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == scanAction) {
        val data = intent.getStringExtra("com.symbol.datawedge.data_string") ?: return
        if (data.isNotBlank()) sendEvent("onScan", mapOf(
          "data" to data.trim(),
          "symbology" to (intent.getStringExtra("com.symbol.datawedge.label_type") ?: ""),
          "source" to (intent.getStringExtra("com.symbol.datawedge.source") ?: "")
        ))
      } else if (intent.action == resultAction && configurationId != null) {
        val commandId = intent.getStringExtra("COMMAND_IDENTIFIER")
        val config = intent.getBundleExtra("com.symbol.datawedge.api.RESULT_GET_CONFIG")
        // Accept untagged GET_CONFIG replies only for the pending profile query.
        if (verifying && config != null &&
          (commandId == "$configurationId-verify" || commandId == null) &&
          config.getString("PROFILE_NAME") == "InspectHubMobile") {
          finishConfiguration(configurationResult, configurationDetails, readConfiguration(config))
          return
        }
        if (verifying) {
          if (commandId == "$configurationId-verify" && intent.getStringExtra("RESULT") == "FAILURE") {
            finishConfiguration("FAILURE", listOf(configurationDetails,
              intent.getBundleExtra("RESULT_INFO")?.let { resultDetails(it) } ?: "GET_CONFIG_FAILED")
              .filter { it.isNotBlank() }.joinToString("; "))
          }
          return
        }
        if (commandId != configurationId) return
        @Suppress("DEPRECATION")
        val results = intent.getParcelableArrayListExtra<Bundle>("RESULT_LIST")
        val result = if (!results.isNullOrEmpty()) {
          if (results.all { it.getString("RESULT") == "SUCCESS" }) "SUCCESS" else "FAILURE"
        } else intent.getStringExtra("RESULT") ?: "UNKNOWN"
        val details = if (!results.isNullOrEmpty()) {
          results.filter { it.getString("RESULT") != "SUCCESS" }
            .map { resultDetails(it) }.filter { it.isNotEmpty() }.joinToString("; ")
        } else intent.getBundleExtra("RESULT_INFO")?.let { resultDetails(it) } ?: ""
        configurationResult = result
        configurationDetails = details
        verifying = true
        // SET_CONFIG can return a module error even when the desired settings
        // already exist. Confirm the actual profile instead of hiding errors.
        appContext.reactContext?.sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").apply {
          setPackage("com.symbol.datawedge")
          putExtra("com.symbol.datawedge.api.GET_CONFIG", "InspectHubMobile")
          putExtra("COMMAND_IDENTIFIER", "$configurationId-verify")
          putExtra("SEND_RESULT", "LAST_RESULT")
        })
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ZebraDataWedge")
    Events("onScan", "onResult")
    OnStartObserving { observing = true; register() }
    OnStopObserving { observing = false; unregister() }
    OnActivityEntersForeground { if (observing) register() }
    OnActivityEntersBackground { unregister() }
    OnDestroy { unregister() }

    Function("configure") {
      handler.post { configureScanner() }
    }
    Function("trigger") {
      val context = appContext.reactContext ?: return@Function null
      context.sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").apply {
        setPackage("com.symbol.datawedge")
        putExtra("com.symbol.datawedge.api.SOFT_SCAN_TRIGGER", "START_SCANNING")
      })
    }
  }

  private fun configureScanner() {
    if (configurationId != null) return
    configurationId = UUID.randomUUID().toString()
    verifying = false
    configurationResult = "UNKNOWN"
    configurationDetails = ""
    handler.postDelayed(configurationTimeout, 10000)
    val barcode = Bundle().apply {
      putString("PLUGIN_NAME", "BARCODE")
      putString("RESET_CONFIG", "false")
      putBundle("PARAM_LIST", Bundle().apply {
        putString("scanner_selection", "auto")
        putString("scanner_input_enabled", "true")
      })
    }
    val output = Bundle().apply {
      putString("PLUGIN_NAME", "INTENT")
      putString("RESET_CONFIG", "false")
      putBundle("PARAM_LIST", Bundle().apply {
        putString("intent_output_enabled", "true")
        putString("intent_action", scanAction)
        putString("intent_category", Intent.CATEGORY_DEFAULT)
        putString("intent_delivery", "2") // Broadcast Intent
      })
    }
    val keyboard = Bundle().apply {
      putString("PLUGIN_NAME", "KEYSTROKE")
      putString("RESET_CONFIG", "false")
      putBundle("PARAM_LIST", Bundle().apply { putString("keystroke_output_enabled", "false") })
    }
    val profile = Bundle().apply {
      putString("PROFILE_NAME", "InspectHubMobile")
      putString("PROFILE_ENABLED", "true")
      putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")
      putParcelableArrayList("PLUGIN_CONFIG", arrayListOf(barcode, output, keyboard))
      putParcelableArray("APP_LIST", arrayOf(Bundle().apply {
        putString("PACKAGE_NAME", "com.inspecthub.mobile")
        putStringArray("ACTIVITY_LIST", arrayOf("*"))
      }))
    }
    sendCommand("com.symbol.datawedge.api.SET_CONFIG", profile)
  }

  @Suppress("DEPRECATION")
  private fun readConfiguration(config: Bundle): Map<String, Any> {
    fun bundles(key: String): List<Bundle> = when (val value = config.get(key)) {
      is List<*> -> value.filterIsInstance<Bundle>()
      is Array<*> -> value.filterIsInstance<Bundle>()
      is Bundle -> listOf(value)
      else -> emptyList()
    }
    fun value(bundle: Bundle?, key: String): String = bundle?.get(key)?.toString() ?: ""
    fun params(plugin: String) = bundles("PLUGIN_CONFIG")
      .firstOrNull { it.getString("PLUGIN_NAME").equals(plugin, ignoreCase = true) }
      ?.getBundle("PARAM_LIST")
    val associated = bundles("APP_LIST").any { app ->
      val activities = when (val value = app.get("ACTIVITY_LIST")) {
        is List<*> -> value
        is Array<*> -> value.toList()
        else -> emptyList<Any>()
      }
      app.getString("PACKAGE_NAME") == "com.inspecthub.mobile" && activities.contains("*")
    }
    return mapOf(
      "profileName" to value(config, "PROFILE_NAME"),
      "profileEnabled" to value(config, "PROFILE_ENABLED"),
      "appAssociated" to associated,
      "barcodeEnabled" to value(params("BARCODE"), "scanner_input_enabled"),
      "intentEnabled" to value(params("INTENT"), "intent_output_enabled"),
      "intentAction" to value(params("INTENT"), "intent_action"),
      "intentCategory" to value(params("INTENT"), "intent_category"),
      "intentDelivery" to value(params("INTENT"), "intent_delivery"),
      "keystrokeEnabled" to value(params("KEYSTROKE"), "keystroke_output_enabled")
    )
  }

  private fun finishConfiguration(result: String, details: String,
    configuration: Map<String, Any>? = null) {
    handler.removeCallbacks(configurationTimeout)
    configurationId = null
    verifying = false
    val event = mutableMapOf<String, Any>("result" to result, "details" to details)
    if (configuration != null) event["configuration"] = configuration
    sendEvent("onResult", event)
  }

  private fun resultDetails(bundle: Bundle): String {
    // DataWedge returns result codes as either a string or an array of strings.
    @Suppress("DEPRECATION")
    fun values(key: String): List<String> = when (val value = bundle.get(key)) {
      is String -> listOf(value)
      is Array<*> -> value.filterIsInstance<String>()
      else -> emptyList()
    }
    return listOf("MODULE", "PLUGIN_NAME", "RESULT_CODE", "SUB_RESULT_CODE")
      .flatMap { values(it) }.filter { it.isNotBlank() }.distinct().joinToString(": ")
  }

  private fun sendCommand(command: String, value: Bundle) {
    val context = appContext.reactContext ?: return
    context.sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").apply {
      setPackage("com.symbol.datawedge")
      putExtra(command, value)
      putExtra("SEND_RESULT", "COMPLETE_RESULT")
      putExtra("COMMAND_IDENTIFIER", configurationId)
    })
  }

  private fun register() {
    if (registeredContext != null) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(scanAction)
      addAction(resultAction)
      addCategory(Intent.CATEGORY_DEFAULT)
    }
    // DataWedge is a separate application, so this dynamic receiver must be exported.
    ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
    registeredContext = context
  }

  private fun unregister() {
    handler.removeCallbacks(configurationTimeout)
    configurationId = null
    verifying = false
    registeredContext?.unregisterReceiver(receiver)
    registeredContext = null
  }
}
