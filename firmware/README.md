# ESP32 Pan-Tilt Servo Controller Firmware

This folder contains the Arduino / C++ firmware for the **AI Humanoid Presentation Robot** to drive two Pan/Tilt servos (MG90S, SG90, MG995, or MG996R) over USB Serial.

---

## 1. Hardware Pin Connections

```
 +--------------------+                     +--------------------------+
 |                    |                     |   EXTERNAL 5V / 2A-3A    |
 |     ESP32 DEVKIT   |                     |       POWER SUPPLY       |
 |                    |                     |                          |
 |                GND +-------------------->| GND (-) [COMMON GROUND]  |
 |                    |                     |                          |
 |            GPIO 18 +----[Orange/Yellow]->| PAN Servo Signal (PWM)   |
 |            GPIO 19 +----[Orange/Yellow]->| TILT Servo Signal (PWM)  |
 |                    |                     |                          |
 |                    |       +------------>| 5V (+) Power Rail        |
 +--------------------+       |             +--------------------------+
                              |
       +----------------------+----------------------+
       |                                             |
+------v--------------------+                 +------v--------------------+
|   PAN SERVO (MG90S/MG996R)|                 |  TILT SERVO (MG90S/MG996R)|
|                           |                 |                           |
| Red wire    : +5V Power   |                 | Red wire    : +5V Power   |
| Brown/Black : GND Ground  |                 | Brown/Black : GND Ground  |
| Orange/Yel  : GPIO 18     |                 | Orange/Yel  : GPIO 19     |
+---------------------------+                 +---------------------------+
```

> [!CAUTION]
> **DO NOT power servos directly from the ESP32 3.3V or VIN pins!**
> Servos draw high current spikes (up to 1.5A stall current per MG996R, 500mA per MG90S). Powering them from the ESP32 will cause brownout resets and could damage the ESP32.
> Always use an external 5V power supply and connect its **GND** to the **ESP32 GND** (Common Ground).

---

## 2. Arduino IDE Setup & Flashing

1. Open **Arduino IDE**.
2. Go to **Tools -> Board -> ESP32 Arduino -> ESP32 Dev Module**.
3. Install the required library:
   - Go to **Sketch -> Include Library -> Manage Libraries...**
   - Search for `ESP32Servo` by Kevin Harrington.
   - Click **Install**.
4. Open [`esp32_servo_controller.ino`](./esp32_servo_controller/esp32_servo_controller.ino).
5. Select your COM port under **Tools -> Port**.
6. Click **Upload**.

---

## 3. Testing Communication via CLI

You can verify and test your ESP32 hardware and servos directly using the Python verification tool:

```bash
# Activate virtual environment
cd backend
.venv\Scripts\activate

# Run interactive ESP32 connection test
python scripts/test_esp32_connection.py --port COM3 --baud 115200
```
*(Replace `COM3` with your actual port. If omitted, the script auto-detects connected USB ports).*

---

## 4. Connecting via Web Dashboard (Live GUI)

1. Open the dashboard at `http://localhost:5173/robot-control`.
2. In the top **Hardware Connection Toolbar**:
   - Click **🔄 Scan** to auto-populate detected COM ports.
   - Select your ESP32 COM port from the dropdown (e.g. `COM3` or `COM4`).
   - Click **🔌 Connect ESP32**.
   - Click **⚡ Ping** to test round-trip latency.
3. Move the Pan/Tilt sliders, click preset buttons, or trigger head tracking!

---

## 5. Troubleshooting & Common Pitfalls

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **"Access Denied" or Port Busy Error** | Another application has the COM port open (e.g., Arduino IDE Serial Monitor or Cura). | Close the Arduino IDE Serial Monitor or other serial terminals. Only one program can access the COM port at a time. |
| **ESP32 Reboots Constantly on Motion** | Insufficient servo power / brownout reset. | Use an external 5V 2A+ power supply. Ensure external GND is connected to ESP32 GND. |
| **Servos Twitch or Don't Move** | Missing common ground between power supply and ESP32, or signal pin mismatch. | Connect external power supply GND wire directly to ESP32 `GND` pin. Verify Pan is on `GPIO 18` and Tilt is on `GPIO 19`. |
| **COM Port Not Detected** | Missing CH340 or CP2102 USB-to-UART driver on Windows. | Download and install CH340 or CP210x driver for your ESP32 board. Check Device Manager -> Ports (COM & LPT). |
| **Timeout on Connect** | ESP32 DTR line triggers automatic bootloader reset when serial port opens. | The backend controller automatically waits 1.2s for ESP32 boot. Ensure baud rate is set to `115200`. |

