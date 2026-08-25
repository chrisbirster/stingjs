package run.stingjs.runtime

import android.content.Context
import android.graphics.Color
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
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
)

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
            else -> Unit
        }
    }

    fun setEventEnabled(id: Int, event: String, enabled: Boolean) {
        val node = requireNode(id)
        val button = node.view as? Button
            ?: throw StingRuntimeException("Event $event is not supported by node $id")
        if (event != "press") {
            throw StingRuntimeException("Event $event is not supported by node $id")
        }

        if (enabled) {
            button.setOnClickListener {
                eventSink?.invoke(id, "press", "null")
            }
        } else {
            button.setOnClickListener(null)
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
        val parentView = parent.view as? ViewGroup
            ?: throw StingRuntimeException("Cannot insert a native view below a text-only node")

        if (parent.type == "text" || parent.type == "button") {
            throw StingRuntimeException("Text and Button may only contain textual children in v0.1")
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
            is TextView -> view.text = text
            is Button -> view.text = text
        }
    }

    private fun applyStyle(style: JSONObject, node: StingNode) {
        val view = node.view ?: return
        val context = view.context

        if (style.has("backgroundColor")) {
            view.setBackgroundColor(Color.parseColor(style.getString("backgroundColor")))
        }

        if (view is LinearLayout) {
            if (style.has("flexDirection")) {
                view.orientation = if (style.getString("flexDirection") == "row") {
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
                view.setPadding(padding, padding, padding, padding)
            }
        }

        if (style.has("color")) {
            val color = Color.parseColor(style.getString("color"))
            when (view) {
                is TextView -> view.setTextColor(color)
                is Button -> view.setTextColor(color)
            }
        }

        if (style.has("fontSize")) {
            val size = style.getDouble("fontSize").toFloat()
            when (view) {
                is TextView -> view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
                is Button -> view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
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
        val layout = parent.view as? LinearLayout ?: return
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
