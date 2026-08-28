import UIKit

final class StingButton: UIButton {
    var nodeId: Int = -1
    var onPress: ((Int) -> Void)?
    private var listening = false

    func setPressEnabled(_ enabled: Bool) {
        guard enabled != listening else { return }
        listening = enabled

        if enabled {
            addTarget(self, action: #selector(handlePress), for: .touchUpInside)
        } else {
            removeTarget(self, action: #selector(handlePress), for: .touchUpInside)
        }
    }

    @objc private func handlePress() {
        onPress?(nodeId)
    }
}
