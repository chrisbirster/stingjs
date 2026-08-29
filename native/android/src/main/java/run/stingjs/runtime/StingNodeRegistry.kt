package run.stingjs.runtime

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

private data class StingNode(
    val id: Int,
    val type: String,
    val view: View? = null,
    val nativeModuleView: StingNativeView? = null,
    var textValue: String? = null,
    var parentId: Int? = null,
    val children: MutableList<Int> = mutableListOf(),
    var gapDp: Float = 0f,
    var imageSource: String? = null,
    val enabledModuleViewEvents: MutableSet<String> = mutableSetOf(),
    var isAttached: Boolean = false,
    val styledKeys: MutableSet<String> = mutableSetOf(),
    var backgroundColor: Int? = null,
    var borderRadiusDp: Float = 0f,
    var alignItems: String = "stretch",
    var justifyContent: String = "start",
    var originalBackground: Drawable? = null,
    var originalTextColors: ColorStateList? = null,
    var originalTypeface: Typeface? = null,
    var originalTextSizePx: Float? = null,
    var originalPaddingLeft: Int = 0,
    var originalPaddingTop: Int = 0,
    var originalPaddingRight: Int = 0,
    var originalPaddingBottom: Int = 0,
    var originalLayoutWidth: Int? = null,
    var originalLayoutHeight: Int? = null,
    var hasCapturedOriginalLayoutSize: Boolean = false,
    var nativeBlurRadiusDp: Float? = null,
)

private class StingEditText(context: Context) : EditText(context) {
    private var changeWatcher: TextWatcher? = null
    private var suppressChange = false

    fun setStingText(value: String) {
        if (text.toString() == value) return
        suppressChange = true
        setText(value)
        setSelection(text.length)
        suppressChange = false
    }

    fun setChangeTextEnabled(enabled: Boolean, onChange: (String) -> Unit) {
        changeWatcher?.let(::removeTextChangedListener)
        changeWatcher = null
        if (!enabled) return

        changeWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                if (!suppressChange) onChange(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) = Unit
        }.also(::addTextChangedListener)
    }
}

private class StingScrollContainer(context: Context) : FrameLayout(context) {
    val content = LinearLayout(context)
    private val vertical = ScrollView(context)
    private val horizontal = HorizontalScrollView(context)
    private var horizontalMode = false

    init {
        content.orientation = LinearLayout.VERTICAL
        setHorizontal(false)
    }

    fun setHorizontal(horizontalEnabled: Boolean) {
        if (childCount > 0 && horizontalMode == horizontalEnabled) return
        horizontalMode = horizontalEnabled

        (content.parent as? ViewGroup)?.removeView(content)
        removeAllViews()
        content.orientation = if (horizontalEnabled) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL

        val scroller: ViewGroup = if (horizontalEnabled) horizontal else vertical
        scroller.removeAllViews()
        scroller.addView(
            content,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ),
        )
        addView(scroller, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }
}

class StingNodeRegistry(private val rootView: ViewGroup) {
    private val nodes = mutableMapOf<Int, StingNode>()
    private var disposed = false
    var eventSink: ((nodeId: Int, event: String, payloadJSON: String) -> Unit)? = null
    var moduleViewFactory: ((module: String, viewType: String, context: Context) -> StingNativeView)? = null

    init {
        nodes[0] = makeNode(id = 0, type = "root", view = rootView, isAttached = true)
    }

    fun createElement(id: Int, type: String) {
        checkActive()
        requireUnused(id)

        val identity = parseModuleViewIdentity(type)
        if (identity != null) {
            val factory = moduleViewFactory ?: throw StingNativeModuleError(
                code = "E_NATIVE_VIEW_UNAVAILABLE",
                message = "Native module views are not connected to this Sting host",
            )
            val nativeView = factory(identity.first, identity.second, rootView.context)
            nodes[id] = makeNode(id, type, nativeView.view, nativeView)
            return
        }

        val normalized = type.lowercase()
        val view = when (normalized) {
            "view" -> LinearLayout(rootView.context).apply { orientation = LinearLayout.VERTICAL }
            "safearea" -> StingSafeAreaLayout(rootView.context)
            "keyboardavoidingview" -> StingKeyboardAvoidingLayout(rootView.context)
            "navigationstack" -> StingNavigationStackLayout(rootView.context)
            "text" -> TextView(rootView.context)
            "button" -> Button(rootView.context)
            "image" -> ImageView(rootView.context).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                adjustViewBounds = true
            }
            "textinput" -> StingEditText(rootView.context)
            "scrollview" -> StingScrollContainer(rootView.context)
            else -> throw StingRuntimeException("Unsupported native element type: $type")
        }
        nodes[id] = makeNode(id, normalized, view)
    }

    fun createTextNode(id: Int, value: String) {
        checkActive()
        requireUnused(id)
        nodes[id] = StingNode(id = id, type = "#text", textValue = value)
    }

    fun replaceText(id: Int, value: String) {
        val node = requireNode(id)
        if (node.type != "#text") throw StingRuntimeException("Node $id is not a text node")
        node.textValue = value
        node.parentId?.let(::refreshTextContent)
    }

    fun insertNode(parentId: Int, nodeId: Int, anchorId: Int) {
        val parent = requireNode(parentId)
        val node = requireNode(nodeId)

        node.parentId?.let { previousParentId ->
            nodes[previousParentId]?.let { previousParent ->
                previousParent.children.removeAll { it == nodeId }
                if (node.isAttached) propagateDetach(nodeId)
                node.parentId = null
                detachView(node.view)
                refreshTextContent(previousParentId)
                refreshGap(previousParent)
                refreshNavigation(previousParent)
            }
        }

        val insertionIndex = if (anchorId >= 0) {
            parent.children.indexOf(anchorId).takeIf { it >= 0 } ?: parent.children.size
        } else {
            parent.children.size
        }

        parent.children.add(insertionIndex, nodeId)
        node.parentId = parentId
        try {
            attachView(node, parent, insertionIndex)
        } catch (error: Throwable) {
            parent.children.removeAll { it == nodeId }
            node.parentId = null
            throw error
        }
        if (parent.isAttached) propagateAttach(nodeId)
        refreshTextContent(parentId)
        refreshGap(parent)
        refreshNavigation(parent)
    }

    fun removeNode(parentId: Int, nodeId: Int) {
        val parent = requireNode(parentId)
        val node = requireNode(nodeId)
        if (node.parentId != parentId) throw StingRuntimeException("Node $nodeId is not a child of $parentId")

        parent.children.removeAll { it == nodeId }
        if (node.isAttached) propagateDetach(nodeId)
        node.parentId = null
        detachView(node.view)
        refreshTextContent(parentId)
        refreshGap(parent)
        refreshNavigation(parent)
    }

    fun setProperty(id: Int, name: String, valueJSON: String) {
        val node = requireNode(id)
        val value = JSONTokener(valueJSON).nextValue()

        node.nativeModuleView?.let { nativeView ->
            when (name) {
                "style" -> {
                    val style = value as? JSONObject ?: throw StingRuntimeException("style must be a JSON object")
                    applyStyle(style, node)
                }
                "nativeModifiers" -> {
                    val modifiers = value as? JSONArray ?: throw StingRuntimeException("nativeModifiers must be a JSON array")
                    applyNativeModifiers(modifiers, node)
                }
                "accessibilityLabel" -> {
                    node.view?.contentDescription = if (value == JSONObject.NULL) null else value as? String
                }
                else -> nativeView.setProperty(name, if (value == JSONObject.NULL) null else value)
            }
            return
        }

        when (name) {
            "style" -> {
                val style = value as? JSONObject ?: throw StingRuntimeException("style must be a JSON object")
                applyStyle(style, node)
            }
            "nativeModifiers" -> {
                val modifiers = value as? JSONArray ?: throw StingRuntimeException("nativeModifiers must be a JSON array")
                applyNativeModifiers(modifiers, node)
            }
            "disabled" -> {
                val disabled = value as? Boolean ?: return
                (node.view as? Button)?.isEnabled = !disabled
            }
            "accessibilityLabel" -> {
                node.view?.contentDescription = if (value == JSONObject.NULL) null else value as? String
            }
            "source" -> applyImageSource(value, node)
            "resizeMode" -> {
                val mode = value as? String ?: return
                (node.view as? ImageView)?.scaleType = when (mode) {
                    "cover" -> ImageView.ScaleType.CENTER_CROP
                    "stretch" -> ImageView.ScaleType.FIT_XY
                    else -> ImageView.ScaleType.FIT_CENTER
                }
            }
            "value" -> {
                val text = if (value == JSONObject.NULL) "" else value as? String ?: ""
                (node.view as? StingEditText)?.setStingText(text)
            }
            "placeholder" -> {
                (node.view as? EditText)?.hint = if (value == JSONObject.NULL) null else value as? String
            }
            "editable" -> {
                val editable = value as? Boolean ?: return
                (node.view as? EditText)?.isEnabled = editable
            }
            "horizontal" -> {
                val horizontal = value as? Boolean ?: return
                (node.view as? StingScrollContainer)?.setHorizontal(horizontal)
            }
            else -> Unit
        }
    }

    fun setEventEnabled(id: Int, event: String, enabled: Boolean) {
        val node = requireNode(id)

        node.nativeModuleView?.let { nativeView ->
            if (enabled) {
                node.enabledModuleViewEvents.add(event)
                try {
                    nativeView.setEventEnabled(event, true, emit@{ payload ->
                        val current = nodes[id]
                        if (disposed || current !== node || !node.isAttached || !node.enabledModuleViewEvents.contains(event)) {
                            return@emit
                        }
                        eventSink?.invoke(id, event, encodeJSONFragment(payload))
                    })
                } catch (error: Throwable) {
                    node.enabledModuleViewEvents.remove(event)
                    throw error
                }
            } else {
                node.enabledModuleViewEvents.remove(event)
                nativeView.setEventEnabled(event, false) { _ -> }
            }
            return
        }

        when {
            event == "press" && node.view is Button -> {
                if (enabled) node.view.setOnClickListener { eventSink?.invoke(id, "press", "null") }
                else node.view.setOnClickListener(null)
            }
            event == "changeText" && node.view is StingEditText -> {
                node.view.setChangeTextEnabled(enabled) { value ->
                    eventSink?.invoke(id, "changeText", JSONObject.quote(value))
                }
            }
            event == "back" && node.view is StingNavigationStackLayout -> {
                node.view.setBackHandler(enabled) {
                    val current = nodes[id]
                    if (!disposed && current === node && node.isAttached) {
                        eventSink?.invoke(id, "back", "null")
                    }
                }
            }
            else -> throw StingRuntimeException("Event $event is not supported by node $id")
        }
    }

    fun viewForNode(id: Int): View? = requireNode(id).view

    /** Route a platform back request to the deepest active declarative navigation stack. */
    fun requestBack(): Boolean {
        checkActive()
        val candidates = nodes.values
            .filter { node ->
                node.isAttached &&
                    node.view is StingNavigationStackLayout &&
                    isOnActiveNavigationPath(node.id)
            }
            .sortedByDescending { navigationDepth(it.id) }

        for (node in candidates) {
            if ((node.view as StingNavigationStackLayout).requestBack()) return true
        }
        return false
    }

    /** Narrow diagnostic surface used by native instrumentation to verify modifier cleanup. */
    fun nativeBlurRadiusForNode(id: Int): Float? = requireNode(id).nativeBlurRadiusDp

    fun dispose() {
        if (disposed) return
        disposed = true
        eventSink = null

        nodes.values.forEach { node ->
            (node.view as? StingNavigationStackLayout)?.setBackHandler(false) {}
        }

        nodes.keys.sorted().filter { it != 0 }.forEach { id ->
            val node = nodes[id] ?: return@forEach
            val nativeView = node.nativeModuleView ?: return@forEach
            if (node.isAttached) {
                node.isAttached = false
                nativeView.didDetach()
            }
            val events = node.enabledModuleViewEvents.toList()
            node.enabledModuleViewEvents.clear()
            events.forEach { event ->
                try { nativeView.setEventEnabled(event, false) { _ -> } } catch (_: Throwable) { }
            }
            detachView(node.view)
            try { nativeView.dispose() } catch (_: Throwable) { }
        }
    }

    private fun makeNode(
        id: Int,
        type: String,
        view: View?,
        nativeModuleView: StingNativeView? = null,
        isAttached: Boolean = false,
    ): StingNode {
        val text = view as? TextView
        return StingNode(
            id = id,
            type = type,
            view = view,
            nativeModuleView = nativeModuleView,
            isAttached = isAttached,
            originalBackground = view?.background,
            originalTextColors = text?.textColors,
            originalTypeface = text?.typeface,
            originalTextSizePx = text?.textSize,
            originalPaddingLeft = view?.paddingLeft ?: 0,
            originalPaddingTop = view?.paddingTop ?: 0,
            originalPaddingRight = view?.paddingRight ?: 0,
            originalPaddingBottom = view?.paddingBottom ?: 0,
        )
    }

    private fun checkActive() {
        if (disposed) throw StingRuntimeException("Sting node registry is disposed")
    }

    private fun requireUnused(id: Int) {
        if (nodes.containsKey(id)) throw StingRuntimeException("Duplicate native node id $id")
    }

    private fun requireNode(id: Int): StingNode {
        checkActive()
        return nodes[id] ?: throw StingRuntimeException("Unknown native node id $id")
    }

    private fun isOnActiveNavigationPath(nodeId: Int): Boolean {
        var currentId = nodeId
        while (true) {
            val current = nodes[currentId] ?: return false
            val parentId = current.parentId ?: return true
            val parent = nodes[parentId] ?: return false
            if (parent.view is StingNavigationStackLayout) {
                val activeChild = parent.children.asReversed().firstOrNull { nodes[it]?.view != null }
                if (activeChild != currentId) return false
            }
            currentId = parentId
        }
    }

    private fun navigationDepth(nodeId: Int): Int {
        var depth = 0
        var current = nodes[nodeId]
        while (current?.parentId != null) {
            depth += 1
            current = nodes[current.parentId]
        }
        return depth
    }

    private fun propagateAttach(nodeId: Int) {
        val node = nodes[nodeId] ?: return
        if (node.isAttached) return
        node.isAttached = true
        node.children.forEach(::propagateAttach)
        node.nativeModuleView?.didAttach()
    }

    private fun propagateDetach(nodeId: Int) {
        val node = nodes[nodeId] ?: return
        if (!node.isAttached) return
        node.isAttached = false
        node.children.forEach(::propagateDetach)
        node.nativeModuleView?.didDetach()
    }

    private fun attachView(node: StingNode, parent: StingNode, insertionIndex: Int) {
        val childView = node.view ?: return
        if (parent.nativeModuleView == null && parent.type in setOf("text", "button", "image", "textinput")) {
            throw StingRuntimeException("Native leaf node ${parent.type} cannot contain view children")
        }

        val parentView = when {
            parent.nativeModuleView != null -> parent.nativeModuleView.childContainer
                ?: throw StingRuntimeException("Native module view ${parent.type} does not accept view children")
            parent.view is StingScrollContainer -> parent.view.content
            parent.view is ViewGroup -> parent.view
            else -> throw StingRuntimeException("Cannot insert a native view below a text-only node")
        }

        val viewIndex = parent.children.take(insertionIndex).count { nodes[it]?.view != null }.coerceAtMost(parentView.childCount)
        parentView.addView(childView, viewIndex)
    }

    private fun detachView(view: View?) {
        val parent = view?.parent as? ViewGroup ?: return
        parent.removeView(view)
    }

    private fun refreshTextContent(parentId: Int) {
        val parent = nodes[parentId] ?: return
        if (parent.nativeModuleView != null) return
        val text = parent.children.mapNotNull { nodes[it]?.textValue }.joinToString(separator = "")
        when (val view = parent.view) {
            is Button -> view.text = text
            is TextView -> view.text = text
        }
    }

    private fun refreshNavigation(parent: StingNode) {
        (parent.view as? StingNavigationStackLayout)?.refreshVisibleScreen()
    }

    private fun applyImageSource(value: Any?, node: StingNode) {
        val imageView = node.view as? ImageView ?: return
        val uri = when (value) {
            is String -> value
            is JSONObject -> value.optString("uri").takeIf { it.isNotBlank() }
            else -> null
        }
        node.imageSource = uri
        imageView.setImageDrawable(null)
        if (uri.isNullOrBlank()) return

        val parsed = Uri.parse(uri)
        if (parsed.scheme == "http" || parsed.scheme == "https") {
            Thread {
                val bitmap = runCatching { URL(uri).openStream().use(BitmapFactory::decodeStream) }.getOrNull() ?: return@Thread
                imageView.post {
                    if (nodes[node.id]?.imageSource == uri) imageView.setImageBitmap(bitmap)
                }
            }.start()
        } else {
            imageView.setImageURI(parsed)
        }
    }

    private fun applyStyle(style: JSONObject, node: StingNode) {
        val view = node.view ?: return
        val context = view.context
        val resolved = style.optBoolean("__stingResolved", false)

        var refreshBackground = false
        if (shouldApply(style, "backgroundColor", node, resolved)) {
            node.backgroundColor = stringOrNull(style, "backgroundColor")?.let(Color::parseColor)
            refreshBackground = true
        }
        if (shouldApply(style, "borderRadius", node, resolved)) {
            node.borderRadiusDp = numberOrNull(style, "borderRadius")?.toFloat() ?: 0f
            refreshBackground = true
        }
        if (refreshBackground) refreshBackground(node)

        if (shouldApply(style, "opacity", node, resolved)) {
            view.alpha = numberOrNull(style, "opacity")?.toFloat() ?: 1f
        }

        val stack = when (view) {
            is LinearLayout -> view
            is StingScrollContainer -> view.content
            else -> null
        }
        if (stack != null) {
            if (view !is StingScrollContainer && shouldApply(style, "flexDirection", node, resolved)) {
                stack.orientation = if (stringOrNull(style, "flexDirection") == "row") LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
                refreshGap(node)
                refreshGravity(node)
            }
            if (shouldApply(style, "gap", node, resolved)) {
                node.gapDp = numberOrNull(style, "gap")?.toFloat() ?: 0f
                refreshGap(node)
            }
            if (shouldApply(style, "alignItems", node, resolved)) {
                node.alignItems = stringOrNull(style, "alignItems") ?: "stretch"
                refreshGravity(node)
            }
            if (shouldApply(style, "justifyContent", node, resolved)) {
                node.justifyContent = stringOrNull(style, "justifyContent") ?: "start"
                refreshGravity(node)
            }
        }

        if (shouldApplyPadding(style, node, resolved)) {
            val target = if (view is StingScrollContainer) view.content else view
            val edges = paddingEdges(style, context, node)
            when (target) {
                is StingSafeAreaLayout -> target.setContentPadding(edges[0], edges[1], edges[2], edges[3])
                is StingKeyboardAvoidingLayout -> target.setContentPadding(edges[0], edges[1], edges[2], edges[3])
                else -> target.setPadding(edges[0], edges[1], edges[2], edges[3])
            }
        }

        if (shouldApply(style, "color", node, resolved)) {
            val color = stringOrNull(style, "color")?.let(Color::parseColor)
            val text = view as? TextView
            if (text != null) {
                if (color != null) text.setTextColor(color)
                else node.originalTextColors?.let(text::setTextColor)
            }
        }

        val applyFontSize = shouldApply(style, "fontSize", node, resolved)
        val applyFontWeight = shouldApply(style, "fontWeight", node, resolved)
        if (applyFontSize || applyFontWeight) {
            (view as? TextView)?.let { text ->
                val size = numberOrNull(style, "fontSize")?.toFloat()
                if (size != null) text.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
                else node.originalTextSizePx?.let { text.setTextSize(TypedValue.COMPLEX_UNIT_PX, it) }
                text.typeface = styledTypeface(node.originalTypeface, style.opt("fontWeight"))
            }
        }

        val applyWidth = shouldApply(style, "width", node, resolved)
        val applyHeight = shouldApply(style, "height", node, resolved)
        if (applyWidth || applyHeight) {
            val params = view.layoutParams ?: ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            if (!node.hasCapturedOriginalLayoutSize) {
                node.originalLayoutWidth = params.width
                node.originalLayoutHeight = params.height
                node.hasCapturedOriginalLayoutSize = true
            }
            if (applyWidth) {
                params.width = numberOrNull(style, "width")?.let { dp(context, it.toFloat()) }
                    ?: node.originalLayoutWidth
                    ?: ViewGroup.LayoutParams.WRAP_CONTENT
            }
            if (applyHeight) {
                params.height = numberOrNull(style, "height")?.let { dp(context, it.toFloat()) }
                    ?: node.originalLayoutHeight
                    ?: ViewGroup.LayoutParams.WRAP_CONTENT
            }
            view.layoutParams = params
        }
    }

    private fun applyNativeModifiers(modifiers: JSONArray, node: StingNode) {
        val view = node.view ?: return
        var blurRadius: Float? = null
        for (index in 0 until modifiers.length()) {
            val modifier = modifiers.optJSONObject(index) ?: continue
            if (modifier.optString("name") != "blur") continue
            val value = modifier.optJSONObject("value")
            blurRadius = value?.optDouble("radius", 16.0)?.toFloat() ?: 16f
        }
        node.nativeBlurRadiusDp = blurRadius
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            view.setRenderEffect(
                blurRadius?.let {
                    val px = dp(view.context, it).toFloat().coerceAtLeast(0.1f)
                    RenderEffect.createBlurEffect(px, px, Shader.TileMode.CLAMP)
                },
            )
        }
    }

    private fun shouldApply(style: JSONObject, key: String, node: StingNode, resolved: Boolean): Boolean {
        if (style.has(key) && !style.isNull(key)) {
            node.styledKeys.add(key)
            return true
        }
        if (resolved && node.styledKeys.remove(key)) return true
        return false
    }

    private fun shouldApplyPadding(style: JSONObject, node: StingNode, resolved: Boolean): Boolean {
        var apply = false
        for (key in listOf("padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft")) {
            if (shouldApply(style, key, node, resolved)) apply = true
        }
        return apply
    }

    private fun paddingEdges(style: JSONObject, context: Context, node: StingNode): IntArray {
        val shorthand = numberOrNull(style, "padding")?.toFloat()
        fun edge(key: String, original: Int): Int {
            val value = numberOrNull(style, key)?.toFloat() ?: shorthand
            return value?.let { dp(context, it) } ?: original
        }
        val resetToOriginal = listOf("padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft")
            .none(node.styledKeys::contains)
        return if (resetToOriginal) {
            intArrayOf(node.originalPaddingLeft, node.originalPaddingTop, node.originalPaddingRight, node.originalPaddingBottom)
        } else {
            intArrayOf(
                edge("paddingLeft", 0),
                edge("paddingTop", 0),
                edge("paddingRight", 0),
                edge("paddingBottom", 0),
            )
        }
    }

    private fun refreshBackground(node: StingNode) {
        val view = node.view ?: return
        if (node.backgroundColor == null && node.borderRadiusDp == 0f) {
            view.background = node.originalBackground
            return
        }
        view.background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(node.backgroundColor ?: Color.TRANSPARENT)
            cornerRadius = dp(view.context, node.borderRadiusDp).toFloat()
        }
    }

    private fun refreshGravity(node: StingNode) {
        val layout = when (val view = node.view) {
            is LinearLayout -> view
            is StingScrollContainer -> view.content
            else -> return
        }
        val horizontal: Int
        val vertical: Int
        if (layout.orientation == LinearLayout.VERTICAL) {
            horizontal = when (node.alignItems) {
                "center" -> Gravity.CENTER_HORIZONTAL
                "end" -> Gravity.END
                "stretch" -> Gravity.FILL_HORIZONTAL
                else -> Gravity.START
            }
            vertical = when (node.justifyContent) {
                "center" -> Gravity.CENTER_VERTICAL
                "end" -> Gravity.BOTTOM
                else -> Gravity.TOP
            }
        } else {
            horizontal = when (node.justifyContent) {
                "center" -> Gravity.CENTER_HORIZONTAL
                "end" -> Gravity.END
                else -> Gravity.START
            }
            vertical = when (node.alignItems) {
                "center" -> Gravity.CENTER_VERTICAL
                "end" -> Gravity.BOTTOM
                "stretch" -> Gravity.FILL_VERTICAL
                else -> Gravity.TOP
            }
        }
        layout.gravity = horizontal or vertical
    }

    private fun styledTypeface(original: Typeface?, raw: Any?): Typeface? {
        if (raw == null || raw == JSONObject.NULL) return original
        val weight = when (raw) {
            is Number -> raw.toInt()
            "bold" -> 700
            "semibold" -> 600
            "medium" -> 500
            else -> 400
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Typeface.create(original ?: Typeface.DEFAULT, weight, false)
        } else {
            Typeface.create(original ?: Typeface.DEFAULT, if (weight >= 600) Typeface.BOLD else Typeface.NORMAL)
        }
    }

    private fun refreshGap(parent: StingNode) {
        val moduleChildContainer = parent.nativeModuleView?.childContainer
        val layout = when {
            moduleChildContainer is LinearLayout -> moduleChildContainer
            parent.view is LinearLayout -> parent.view
            parent.view is StingScrollContainer -> parent.view.content
            else -> return
        }
        val gap = dp(layout.context, parent.gapDp)
        val childViews = parent.children.mapNotNull { nodes[it]?.view }
        childViews.forEachIndexed { index, child ->
            val existing = child.layoutParams
            val params = if (existing is LinearLayout.LayoutParams) existing else LinearLayout.LayoutParams(
                existing?.width ?: ViewGroup.LayoutParams.WRAP_CONTENT,
                existing?.height ?: ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            params.leftMargin = if (layout.orientation == LinearLayout.HORIZONTAL && index > 0) gap else 0
            params.topMargin = if (layout.orientation == LinearLayout.VERTICAL && index > 0) gap else 0
            child.layoutParams = params
        }
    }

    private fun parseModuleViewIdentity(type: String): Pair<String, String>? {
        if (!type.startsWith(MODULE_VIEW_PREFIX)) return null
        val body = type.removePrefix(MODULE_VIEW_PREFIX)
        val pieces = body.split(':')
        if (pieces.size != 2 || pieces.any { !MODULE_VIEW_SEGMENT.matches(it) }) {
            throw StingNativeModuleError(
                code = "E_INVALID_VIEW_TYPE",
                message = "Malformed Sting native module view type $type",
            )
        }
        return pieces[0] to pieces[1]
    }

    private fun stringOrNull(style: JSONObject, key: String): String? =
        if (style.has(key) && !style.isNull(key)) style.getString(key) else null

    private fun numberOrNull(style: JSONObject, key: String): Double? =
        if (style.has(key) && !style.isNull(key)) style.getDouble(key) else null

    private fun encodeJSONFragment(value: Any?): String {
        val encoded = JSONArray().put(JSONObject.wrap(value)).toString()
        return encoded.substring(1, encoded.length - 1)
    }

    private fun dp(context: Context, value: Float): Int =
        (value * context.resources.displayMetrics.density).toInt()

    private companion object {
        const val MODULE_VIEW_PREFIX = "__sting_module_view__:"
        val MODULE_VIEW_SEGMENT = Regex("^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    }
}
