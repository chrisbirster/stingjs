package run.stingjs.runtime

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
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
import org.json.JSONObject
import org.json.JSONTokener

private data class StingNode(
    val id: Int,
    val type: String,
    val view: View? = null,
    var textValue: String? = null,
    var parentId: Int? = null,
    val children: MutableList<Int> = mutableListOf(),
    var gapDp: Float = 0f,
    var imageSource: String? = null,
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
        addView(
            scroller,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }
}

class StingNodeRegistry(private val rootView: ViewGroup) {
    private val nodes = mutableMapOf<Int, StingNode>()
    var eventSink: ((nodeId: Int, event: String, payloadJSON: String) -> Unit)? = null

    init {
        nodes[0] = StingNode(id = 0, type = "root", view = rootView)
    }

    fun createElement(id: Int, type: String) {
        requireUnused(id)
        val normalized = type.lowercase()
        val view = when (normalized) {
            "view" -> LinearLayout(rootView.context).apply {
                orientation = LinearLayout.VERTICAL
            }
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
        nodes[id] = StingNode(id = id, type = normalized, view = view)
    }

    fun createTextNode(id: Int, value: String) {
        requireUnused(id)
        nodes[id] = StingNode(id = id, type = "#text", textValue = value)
    }

    fun replaceText(id: Int, value: String) {
        val node = requireNode(id)
        if (node.type != "#text") {
            throw StingRuntimeException("Node $id is not a text node")
        }
        node.textValue = value
        node.parentId?.let(::refreshTextContent)
    }

    fun insertNode(parentId: Int, nodeId: Int, anchorId: Int) {
        val parent = requireNode(parentId)
        val node = requireNode(nodeId)

        node.parentId?.let { previousParentId ->
            nodes[previousParentId]?.let { previousParent ->
                previousParent.children.removeAll { it == nodeId }
                detachView(node.view)
                refreshTextContent(previousParentId)
                refreshGap(previousParent)
            }
        }

        val insertionIndex = if (anchorId >= 0) {
            parent.children.indexOf(anchorId).takeIf { it >= 0 } ?: parent.children.size
        } else {
            parent.children.size
        }

        parent.children.add(insertionIndex, nodeId)
        node.parentId = parentId
        attachView(node, parent, insertionIndex)
        refreshTextContent(parentId)
        refreshGap(parent)
    }

    fun removeNode(parentId: Int, nodeId: Int) {
        val parent = requireNode(parentId)
        val node = requireNode(nodeId)
        if (node.parentId != parentId) {
            throw StingRuntimeException("Node $nodeId is not a child of $parentId")
        }

        parent.children.removeAll { it == nodeId }
        node.parentId = null
        detachView(node.view)
        refreshTextContent(parentId)
        refreshGap(parent)
    }

    fun setProperty(id: Int, name: String, valueJSON: String) {
        val node = requireNode(id)
        val value = JSONTokener(valueJSON).nextValue()

        when (name) {
            "style" -> {
                val style = value as? JSONObject
                    ?: throw StingRuntimeException("style must be a JSON object")
                applyStyle(style, node)
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
        when {
            event == "press" && node.view is Button -> {
                if (enabled) {
                    node.view.setOnClickListener { eventSink?.invoke(id, "press", "null") }
                } else {
                    node.view.setOnClickListener(null)
                }
            }
            event == "changeText" && node.view is StingEditText -> {
                node.view.setChangeTextEnabled(enabled) { value ->
                    eventSink?.invoke(id, "changeText", JSONObject.quote(value))
                }
            }
            else -> throw StingRuntimeException("Event $event is not supported by node $id")
        }
    }

    fun viewForNode(id: Int): View? = requireNode(id).view

    private fun requireUnused(id: Int) {
        if (nodes.containsKey(id)) {
            throw StingRuntimeException("Duplicate native node id $id")
        }
    }

    private fun requireNode(id: Int): StingNode = nodes[id]
        ?: throw StingRuntimeException("Unknown native node id $id")

    private fun attachView(node: StingNode, parent: StingNode, insertionIndex: Int) {
        val childView = node.view ?: return
        if (parent.type in setOf("text", "button", "image", "textinput")) {
            throw StingRuntimeException("Native leaf node ${parent.type} cannot contain view children")
        }

        val parentView = when (val view = parent.view) {
            is StingScrollContainer -> view.content
            is ViewGroup -> view
            else -> throw StingRuntimeException("Cannot insert a native view below a text-only node")
        }

        val viewIndex = parent.children
            .take(insertionIndex)
            .count { nodes[it]?.view != null }
            .coerceAtMost(parentView.childCount)
        parentView.addView(childView, viewIndex)
    }

    private fun detachView(view: View?) {
        val parent = view?.parent as? ViewGroup ?: return
        parent.removeView(view)
    }

    private fun refreshTextContent(parentId: Int) {
        val parent = nodes[parentId] ?: return
        val text = parent.children.mapNotNull { nodes[it]?.textValue }.joinToString(separator = "")

        when (val view = parent.view) {
            is Button -> view.text = text
            is TextView -> view.text = text
        }
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
                val bitmap = runCatching {
                    URL(uri).openStream().use(BitmapFactory::decodeStream)
                }.getOrNull() ?: return@Thread
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

        if (style.has("backgroundColor")) {
            view.setBackgroundColor(Color.parseColor(style.getString("backgroundColor")))
        }

        val stack = when (view) {
            is LinearLayout -> view
            is StingScrollContainer -> view.content
            else -> null
        }
        if (stack != null) {
            if (style.has("flexDirection") && view !is StingScrollContainer) {
                stack.orientation = if (style.getString("flexDirection") == "row") {
                    LinearLayout.HORIZONTAL
                } else {
                    LinearLayout.VERTICAL
                }
            }
            if (style.has("gap")) {
                node.gapDp = style.getDouble("gap").toFloat()
                refreshGap(node)
            }
            if (style.has("padding")) {
                val padding = dp(context, style.getDouble("padding").toFloat())
                stack.setPadding(padding, padding, padding, padding)
            }
        }

        if (style.has("color")) {
            val color = Color.parseColor(style.getString("color"))
            when (view) {
                is Button -> view.setTextColor(color)
                is TextView -> view.setTextColor(color)
            }
        }

        if (style.has("fontSize")) {
            val size = style.getDouble("fontSize").toFloat()
            when (view) {
                is Button -> view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
                is TextView -> view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
            }
        }

        if (style.has("width") || style.has("height")) {
            val params = view.layoutParams ?: ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            if (style.has("width")) params.width = dp(context, style.getDouble("width").toFloat())
            if (style.has("height")) params.height = dp(context, style.getDouble("height").toFloat())
            view.layoutParams = params
        }
    }

    private fun refreshGap(parent: StingNode) {
        val layout = when (val view = parent.view) {
            is LinearLayout -> view
            is StingScrollContainer -> view.content
            else -> return
        }
        val gap = dp(layout.context, parent.gapDp)
        val childViews = parent.children.mapNotNull { nodes[it]?.view }

        childViews.forEachIndexed { index, child ->
            val existing = child.layoutParams
            val params = if (existing is LinearLayout.LayoutParams) {
                existing
            } else {
                LinearLayout.LayoutParams(
                    existing?.width ?: ViewGroup.LayoutParams.WRAP_CONTENT,
                    existing?.height ?: ViewGroup.LayoutParams.WRAP_CONTENT,
                )
            }
            params.leftMargin = if (layout.orientation == LinearLayout.HORIZONTAL && index > 0) gap else 0
            params.topMargin = if (layout.orientation == LinearLayout.VERTICAL && index > 0) gap else 0
            child.layoutParams = params
        }
    }

    private fun dp(context: Context, value: Float): Int =
        (value * context.resources.displayMetrics.density).toInt()
}
