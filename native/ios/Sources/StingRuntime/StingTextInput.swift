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

    @objc private func handleEditingChanged() {
        onChangeText?(nodeId, text ?? "")
    }
}
