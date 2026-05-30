import sys

import torch


def main():
    print("PyTorch:", torch.__version__)
    print("CUDA available:", torch.cuda.is_available())

    if not torch.cuda.is_available():
        print("CUDA not available. GPU-only training/running will be blocked.")
        print("Install PyTorch CUDA, contoh:")
        print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
        return 1

    torch.cuda.set_device(0)
    print("GPU:", torch.cuda.get_device_name(0))
    print("Compute Capability:", torch.cuda.get_device_capability(0))
    print("Arch list:", torch.cuda.get_arch_list())

    x = torch.randn(100, 100, device="cuda:0")
    y = torch.randn(100, 100, device="cuda:0")
    _ = x @ y
    torch.cuda.synchronize()
    print("GPU computation test: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
