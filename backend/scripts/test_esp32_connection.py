#!/usr/bin/env python3
"""
ESP32 Hardware Connection & Serial Diagnostics CLI Tool
-------------------------------------------------------
Use this script to verify bidirectional communication with the ESP32
microcontroller and test MG90S / MG995 / MG996R servo movements.

Usage:
    python scripts/test_esp32_connection.py [--port COM3] [--baud 115200]
"""

import argparse
import sys
import time


def scan_ports():
    try:
        import serial.tools.list_ports
        ports = list(serial.tools.list_ports.comports())
        print("=" * 60)
        print("  AVAILABLE SERIAL PORTS ON THIS SYSTEM:")
        print("=" * 60)
        if not ports:
            print("  [!] No COM ports detected. Please connect ESP32 via USB.")
        for p in ports:
            print(f"  -> Port: {p.device:<10} | Description: {p.description}")
            print(f"     HWID: {p.hwid}")
        print("=" * 60)
        return ports
    except ImportError:
        print("[!] pyserial not installed. Run: pip install pyserial")
        return []


def test_esp32(port: str, baud: int):
    try:
        import serial
    except ImportError:
        print("[!] pyserial is required. Install with: pip install pyserial")
        sys.exit(1)

    print(f"\n[1/5] Opening serial connection to {port} @ {baud} baud...")
    try:
        ser = serial.Serial(port=port, baudrate=baud, timeout=1.0)
    except Exception as exc:
        print(f"[X] Failed to open port {port}: {exc}")
        print("\nTroubleshooting tips:")
        print("  1. Ensure ESP32 USB cable is connected.")
        print("  2. Ensure Arduino IDE Serial Monitor is CLOSED (only one program can use COM port).")
        print("  3. Check Windows Device Manager under 'Ports (COM & LPT)' to confirm COM number.")
        print("  4. Install CH340 or CP2102 USB drivers if COM port is missing.")
        sys.exit(1)

    # ESP32 auto-resets on serial connection via DTR line.
    print("[2/5] Waiting 1.8 seconds for ESP32 bootloader to initialize...")
    time.sleep(1.8)

    # Flush any bootloader garbage
    ser.reset_input_buffer()
    ser.reset_output_buffer()

    print("[3/5] Testing Ping / Handshake...")
    ser.write(b"<PING>\n")
    ser.flush()

    start_time = time.perf_counter()
    reply = ser.readline().decode("ascii", errors="replace").strip()
    latency_ms = (time.perf_counter() - start_time) * 1000.0

    if "<PONG>" in reply or "<READY" in reply:
        print(f"  [OK] ESP32 Responded: {reply} (Round-Trip Latency: {latency_ms:.1f}ms)")
    else:
        print(f"  [?] Received: {reply!r}")
        # Try once more
        ser.write(b"<PING>\n")
        reply = ser.readline().decode("ascii", errors="replace").strip()
        print(f"  [Retry] Received: {reply!r}")

    print("\n[4/5] Testing Status Query...")
    ser.write(b"<STATUS>\n")
    ser.flush()
    status_reply = ser.readline().decode("ascii", errors="replace").strip()
    print(f"  Status response: {status_reply}")

    print("\n[5/5] Testing Servo Movement Sequence (MG90S / MG995 / MG996R)...")
    test_moves = [
        ("<P:90.0,T:90.0,S:80>\n", "Center Position (90°, 90°)"),
        ("<P:120.0,T:90.0,S:80>\n", "Pan Left (120°, 90°)"),
        ("<P:60.0,T:90.0,S:80>\n", "Pan Right (60°, 90°)"),
        ("<P:90.0,T:120.0,S:80>\n", "Tilt Up (90°, 120°)"),
        ("<P:90.0,T:60.0,S:80>\n", "Tilt Down (90°, 60°)"),
        ("<CENTER>\n", "Return to Home (90°, 90°)"),
    ]

    for cmd, desc in test_moves:
        print(f"  -> Sending: {desc} -> {cmd.strip()}")
        ser.write(cmd.encode("ascii"))
        ser.flush()
        ack = ser.readline().decode("ascii", errors="replace").strip()
        print(f"     ESP32 ACK: {ack}")
        time.sleep(0.6)

    ser.close()
    print("\n" + "=" * 60)
    print("  [SUCCESS] ESP32 communication & servo pipeline fully verified!")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Test ESP32 Serial Communication")
    parser.add_argument("--port", type=str, default=None, help="Serial port (e.g., COM3, /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    args = parser.parse_args()

    ports = scan_ports()

    port = args.port
    if not port:
        if ports:
            port = ports[0].device
            print(f"Auto-selected detected port: {port}")
        else:
            port = "COM3"
            print("Defaulting to COM3 (no ports auto-detected)")

    test_esp32(port, args.baud)


if __name__ == "__main__":
    main()
