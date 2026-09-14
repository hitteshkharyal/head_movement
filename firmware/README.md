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

## 3. Connecting to the Web Dashboard

In `backend/.env`, set:
```env
ESP32_CONNECTION_TYPE=serial
ESP32_SERIAL_PORT=COM3     # Replace COM3 with your actual ESP32 port (e.g. COM4, COM5, /dev/ttyUSB0)
ESP32_BAUD_RATE=115200
```
Then start the backend server.
