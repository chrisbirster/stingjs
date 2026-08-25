package run.stingjs.runtime

data class StingMutationCounts(
    var createElement: Int = 0,
    var createTextNode: Int = 0,
    var replaceText: Int = 0,
    var setProperty: Int = 0,
    var insertNode: Int = 0,
    var removeNode: Int = 0,
    var setEventEnabled: Int = 0,
)
