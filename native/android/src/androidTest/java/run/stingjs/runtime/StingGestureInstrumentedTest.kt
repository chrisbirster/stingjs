package run.stingjs.runtime

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGestureInstrumentedTest {
    @Test
    fun gestureHandlersUsePlainValuePayloadsAndCanBeDisabled() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val view = StingGestureLayout(context)
        val events = mutableListOf<Pair<String, Map<String, Any>>>()

        view.setGestureEventEnabled("tap", true) { events += "tap" to it }
        view.setGestureEventEnabled("pan", true) { events += "pan" to it }

        view.emitForTesting("tap", mapOf("x" to 12.0, "y" to 20.0, "touches" to 1))
        view.emitForTesting(
            "pan",
            mapOf(
                "x" to 20.0,
                "y" to 30.0,
                "translationX" to 8.0,
                "translationY" to 10.0,
                "velocityX" to 120.0,
                "velocityY" to 80.0,
                "touches" to 1,
                "cancelled" to false,
            ),
        )

        assertEquals(listOf("tap", "pan"), events.map { it.first })
        assertEquals(12.0, events[0].second["x"])
        assertEquals(8.0, events[1].second["translationX"])

        view.setGestureEventEnabled("tap", false) { }
        view.emitForTesting("tap", mapOf("x" to 1.0, "y" to 1.0, "touches" to 1))
        assertEquals(2, events.size)
    }
}
