package expo.modules.operatordisplay

import android.os.Handler
import android.os.Looper
import android.view.Window
import android.view.ViewTreeObserver
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WindowFocusChangeListener
import com.facebook.react.interfaces.ExtraWindowEventListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OperatorDisplayModule : Module() {
  private data class WindowState(
    val brightness: Float,
    val layoutListener: ViewTreeObserver.OnGlobalLayoutListener,
    val focusListener: ViewTreeObserver.OnWindowFocusChangeListener,
  )

  private val main = Handler(Looper.getMainLooper())
  private val windows = mutableMapOf<Window, WindowState>()
  private var enabled = false
  private var registeredContext: ReactContext? = null

  private val extraWindows = object : ExtraWindowEventListener {
    override fun onExtraWindowCreate(window: Window) {
      main.post { if (enabled) apply(window) }
    }

    override fun onExtraWindowDestroy(window: Window) {
      main.post { restore(window) }
    }
  }

  private val focus = object : WindowFocusChangeListener {
    override fun onWindowFocusChange(hasFocus: Boolean) {
      if (hasFocus) main.post { if (enabled) applyAll() }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OperatorDisplay")

    Function("activate") {
      main.post {
        enabled = true
        register()
        applyAll()
      }
    }

    Function("deactivate") { main.post { deactivate() } }
    OnActivityEntersForeground {
      main.post {
        if (enabled) {
          register()
          applyAll()
        }
      }
    }
    OnDestroy { main.post { deactivate() } }
  }

  private fun register() {
    if (registeredContext != null) return
    val context = appContext.reactContext as? ReactContext ?: return
    context.addExtraWindowEventListener(extraWindows)
    context.addWindowFocusChangeListener(focus)
    registeredContext = context
  }

  private fun applyAll() {
    appContext.currentActivity?.window?.let { apply(it) }
    windows.keys.toList().forEach { apply(it) }
  }

  private fun apply(window: Window) {
    windows.getOrPut(window) {
      val decor = window.decorView
      val layoutListener = ViewTreeObserver.OnGlobalLayoutListener {
        val insets = ViewCompat.getRootWindowInsets(decor)
        if (enabled && decor.hasWindowFocus() &&
          (insets?.isVisible(WindowInsetsCompat.Type.navigationBars()) == true ||
            insets?.isVisible(WindowInsetsCompat.Type.statusBars()) == true)) {
          hideBars(window)
        }
      }
      val focusListener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
        if (enabled && hasFocus) hideBars(window)
      }
      decor.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
      decor.viewTreeObserver.addOnWindowFocusChangeListener(focusListener)
      // Reapply after attachment/layout, when the window can control its insets.
      decor.post { if (enabled && windows.containsKey(window)) hideBars(window) }
      WindowState(window.attributes.screenBrightness, layoutListener, focusListener)
    }
    window.attributes = window.attributes.apply { screenBrightness = 1f }
    hideBars(window)
  }

  private fun hideBars(window: Window) {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }

  private fun restore(window: Window) {
    val state = windows.remove(window) ?: return
    window.decorView.viewTreeObserver.takeIf { it.isAlive }?.apply {
      removeOnGlobalLayoutListener(state.layoutListener)
      removeOnWindowFocusChangeListener(state.focusListener)
    }
    window.attributes = window.attributes.apply { screenBrightness = state.brightness }
    WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
  }

  private fun deactivate() {
    enabled = false
    registeredContext?.removeExtraWindowEventListener(extraWindows)
    registeredContext?.removeWindowFocusChangeListener(focus)
    registeredContext = null
    windows.keys.toList().forEach { restore(it) }
  }
}
