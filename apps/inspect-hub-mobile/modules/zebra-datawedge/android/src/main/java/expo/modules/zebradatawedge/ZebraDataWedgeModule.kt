package expo.modules.zebradatawedge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZebraDataWedgeModule : Module() {
  private val scanAction = "com.inspecthub.mobile.SCAN"
  private val resultAction = "com.symbol.datawedge.api.RESULT_ACTION"
  private var observing = false
  private var registeredContext: Context? = null

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == scanAction) {
        val data = intent.getStringExtra("com.symbol.datawedge.data_string") ?: return
        if (data.isNotBlank()) sendEvent("onScan", mapOf(
          "data" to data.trim(),
          "symbology" to (intent.getStringExtra("com.symbol.datawedge.label_type") ?: ""),
          "source" to (intent.getStringExtra("com.symbol.datawedge.source") ?: "")
        ))
      } else if (intent.action == resultAction &&
        intent.getStringExtra("COMMAND_IDENTIFIER") == "inspect-hub-config") {
        @Suppress("DEPRECATION")
        val results = intent.getParcelableArrayListExtra<Bundle>("RESULT_LIST")
        val result = if (!results.isNullOrEmpty()) {
          if (results.all { it.getString("RESULT") == "SUCCESS" }) "SUCCESS" else "FAILURE"
        } else intent.getStringExtra("RESULT") ?: "UNKNOWN"
        sendEvent("onResult", mapOf("result" to result))
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
      val barcode = Bundle().apply {
        putString("PLUGIN_NAME", "BARCODE")
        putString("RESET_CONFIG", "true")
        putBundle("PARAM_LIST", Bundle().apply {
          putString("scanner_selection", "auto")
          putString("scanner_input_enabled", "true")
        })
      }
      val output = Bundle().apply {
        putString("PLUGIN_NAME", "INTENT")
        putString("RESET_CONFIG", "true")
        putBundle("PARAM_LIST", Bundle().apply {
          putString("intent_output_enabled", "true")
          putString("intent_action", scanAction)
          putString("intent_category", Intent.CATEGORY_DEFAULT)
          putString("intent_delivery", "2") // Broadcast Intent
        })
      }
      val keyboard = Bundle().apply {
        putString("PLUGIN_NAME", "KEYSTROKE")
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
    Function("trigger") {
      val context = appContext.reactContext ?: return@Function null
      context.sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").apply {
        setPackage("com.symbol.datawedge")
        putExtra("com.symbol.datawedge.api.SOFT_SCAN_TRIGGER", "START_SCANNING")
      })
    }
  }

  private fun sendCommand(command: String, value: Bundle) {
    val context = appContext.reactContext ?: return
    context.sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").apply {
      setPackage("com.symbol.datawedge")
      putExtra(command, value)
      putExtra("SEND_RESULT", "COMPLETE_RESULT")
      putExtra("COMMAND_IDENTIFIER", "inspect-hub-config")
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
    registeredContext?.unregisterReceiver(receiver)
    registeredContext = null
  }
}
