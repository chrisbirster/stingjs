import UIKit

final class StingTextInput: UITextField {
    var nodeId: Int = -1
    var onChangeText: ((Int, String) -> Void)?
    private var listening = false

    func setChangeTextEnabled(_ enabled: Bool) {
        guard enabled != listening else { return }
        listening = enabled

        if enabled {
            addTarget(self, action: #selector(handleEditingChanged), for: .editingChanged)
        } else {
            removeTarget(self, action: #selector(handleEditingChanged), for: .editingChanged)
        }
    }

    // Internal so the unhosted StingRuntime XCTest target can prove the same
    // event-routing callback without requiring UIApplication to dispatch a
    // UIControl action. Production UIKit still reaches this selector through
    // .editingChanged.
    @objc func handleEditingChanged() {
        onChangeText?(nodeId, text ?? "")
    }
}
