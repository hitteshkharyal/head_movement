/*
  =============================================================================
  AI HUMANOID PRESENTATION ROBOT — ESP32 SERVO FIRMWARE (V1.2 DUAL-MODE)
  =============================================================================
  Target Microcontroller : ESP32 Dev Module / ESP32-WROOM-32 / NodeMCU-32S
  Servos Supported       : SG90, MG90S, MG995, MG996R (180° standard PWM)
  PWM Frequency          : 50 Hz (20ms period)
  Pulse Widths           : 500us (0°) to 2500us (180°)
  Default Signal Pins    : PAN -> GPIO 18 | TILT -> GPIO 19
  Baud Rate              : 115200 bps

  COMMUNICATION MODES:
  -----------------------------------------------------------------------------
  1. USB Serial Mode     : Plug USB into PC, connects via COM port @ 115200 baud.
  2. Wireless Wi-Fi Mode : Set ENABLE_WIFI to true and enter SSID/Password.
                           ESP32 connects to Wi-Fi and listens on TCP port 8080.
                           Both USB Serial and Wi-Fi work simultaneously!
  =============================================================================
*/

#include <ESP32Servo.h>
#include <WiFi.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// --- PIN DEFINITIONS ---
#define PIN_SERVO_PAN   18   // GPIO 18 for Pan (Yaw - Horizontal)
#define PIN_SERVO_TILT  19   // GPIO 19 for Tilt (Pitch - Vertical)
#define PIN_LED_STATUS   2   // Built-in blue LED for connection & motion status

// --- WIRELESS WI-FI CONFIGURATION (OPTIONAL) ---
// Set ENABLE_WIFI to true to enable wireless robot control over your home/office Wi-Fi or PC Hotspot.
#define ENABLE_WIFI true
const char* WIFI_SSID     = "pc_h";
const char* WIFI_PASSWORD = "12345678";
const uint16_t TCP_PORT   = 8080;

WiFiServer wifiServer(TCP_PORT);
WiFiClient wifiClient;

// --- SERVO CONFIGURATION (MG90S / MG995 / MG996R) ---
#define SERVO_MIN_PULSE_US  500    // 0 degrees (0.5ms)
#define SERVO_MAX_PULSE_US  2500   // 180 degrees (2.5ms)
#define SERVO_PWM_FREQ_HZ   50     // 50Hz standard servo refresh

// --- SERVO OBJECTS ---
Servo servoPan;
Servo servoTilt;

// --- STATE VARIABLES ---
float currentPanAngle  = 90.0;
float currentTiltAngle = 90.0;
float targetPanAngle   = 90.0;
float targetTiltAngle  = 90.0;
int   movementSpeed    = 80;
bool  isEmergencyStop  = false;
bool  isMoving         = false;
bool  swapAxisPins     = false; // When true, GPIO 18 writes Tilt, GPIO 19 writes Pan
bool  invertPan        = false; // When true, Pan 0°-180° is mirrored
bool  invertTilt       = false; // When true, Tilt 0°-180° is mirrored

unsigned long lastStepTime = 0;
unsigned long lastTelemetryTime = 0;
String serialInputBuffer = "";
String wifiInputBuffer = "";
const unsigned int MAX_BUFFER_LEN = 128;


// Compute XOR Checksum of payload string
uint8_t computeChecksum(const String& payload) {
  uint8_t chk = 0;
  for (unsigned int i = 0; i < payload.length(); i++) {
    chk ^= (uint8_t)payload[i];
  }
  return chk;
}

// Broadcast message over both Serial and Wi-Fi
void sendResponse(const String& msg) {
  Serial.println(msg);
  if (ENABLE_WIFI && wifiClient && wifiClient.connected()) {
    wifiClient.println(msg);
  }
}

void setup() {
  // 1. Disable hardware brownout detector to prevent sudden resets during servo startup surges
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  // 2. Initialize USB Serial port with buffer expansion
  Serial.begin(115200);
  delay(600); // Allow USB-UART bridge to settle
  
  Serial.println();
  Serial.println("==================================================");
  Serial.println("🤖 AI HUMANOID ROBOT - ESP32 SERVO CONTROLLER V1.2");
  Serial.println("==================================================");

  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_LED_STATUS, LOW);

  // Allow allocation of all timers for ESP32PWM
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servoPan.setPeriodHertz(SERVO_PWM_FREQ_HZ);
  servoTilt.setPeriodHertz(SERVO_PWM_FREQ_HZ);

  // Attach servos with calibrated pulse width limits
  servoPan.attach(PIN_SERVO_PAN, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  servoTilt.attach(PIN_SERVO_TILT, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);

  // Initialize at centered position (90°, 90°)
  servoPan.write((int)currentPanAngle);
  servoTilt.write((int)currentTiltAngle);

  // Flash status LED on boot
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED_STATUS, HIGH);
    delay(80);
    digitalWrite(PIN_LED_STATUS, LOW);
    delay(80);
  }

  // Initialize Wi-Fi if enabled
  if (ENABLE_WIFI) {
    Serial.printf("[WiFi] Connecting to SSID: '%s' ...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt < 10000)) {
      delay(300);
      Serial.print(".");
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println();
      Serial.println("==================================================");
      Serial.println("✅ [WiFi] CONNECTED SUCCESSFULLY!");
      Serial.print("📡 [WiFi] ESP32 IP Address : ");
      Serial.println(WiFi.localIP());
      Serial.printf("🔌 [WiFi] TCP Socket Port  : %d\n", TCP_PORT);
      Serial.println("==================================================");
      wifiServer.begin();
    } else {
      Serial.println();
      Serial.printf("⚠️ [WiFi] Could not connect to '%s' (Status: %d). Continuing in USB Serial mode.\n", WIFI_SSID, WiFi.status());
    }
  }

  delay(100);
  sendResponse("<READY:ESP32_SERVO_CONTROLLER_V1.2>");
}

void loop() {
  // 1. Process USB Serial commands
  readSerial();

  // 2. Process Wi-Fi TCP socket commands
  if (ENABLE_WIFI) {
    readWiFi();
  }

  // 3. Smooth trajectory stepping toward targets
  updateServoMovement();

  // 4. Periodic telemetry during movement
  broadcastTelemetry();
}

void readSerial() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();

    if (inChar == '<') {
      serialInputBuffer = "";
    } else if (inChar == '>') {
      if (serialInputBuffer.length() > 0) {
        parseAndExecuteCommand(serialInputBuffer);
      }
      serialInputBuffer = "";
    } else if (inChar != '\r' && inChar != '\n') {
      if (serialInputBuffer.length() < MAX_BUFFER_LEN) {
        serialInputBuffer += inChar;
      } else {
        serialInputBuffer = "";
      }
    }
  }
}

void readWiFi() {
  // Accept new incoming TCP client
  if (wifiServer.hasClient()) {
    if (!wifiClient || !wifiClient.connected()) {
      if (wifiClient) wifiClient.stop();
      wifiClient = wifiServer.available();
      Serial.println("[WiFi] New client connected!");
      wifiClient.println("<READY:ESP32_SERVO_CONTROLLER_V1.2>");
    }
  }

  if (wifiClient && wifiClient.connected()) {
    while (wifiClient.available()) {
      char inChar = (char)wifiClient.read();
      if (inChar == '<') {
        wifiInputBuffer = "";
      } else if (inChar == '>') {
        if (wifiInputBuffer.length() > 0) {
          parseAndExecuteCommand(wifiInputBuffer);
        }
        wifiInputBuffer = "";
      } else if (inChar != '\r' && inChar != '\n') {
        if (wifiInputBuffer.length() < MAX_BUFFER_LEN) {
          wifiInputBuffer += inChar;
        } else {
          wifiInputBuffer = "";
        }
      }
    }
  }
}

void parseAndExecuteCommand(String cmd) {
  cmd.trim();

  // 1. Emergency Stop command
  if (cmd == "!ESTOP") {
    isEmergencyStop = true;
    isMoving = false;
    digitalWrite(PIN_LED_STATUS, HIGH); // Steady LED on E-Stop
    sendResponse("<!ESTOP_ACTIVE>");
    return;
  }

  // 2. Resume / Clear Emergency Stop
  if (cmd == "RESUME") {
    isEmergencyStop = false;
    digitalWrite(PIN_LED_STATUS, LOW);
    sendResponse("<ACK:RESUME>");
    return;
  }

  if (isEmergencyStop) {
    sendResponse("<ERR:BLOCKED_BY_ESTOP>");
    return;
  }

  // 3. Ping / Handshake Command
  if (cmd == "PING" || cmd == "HELLO" || cmd == "CONNECT") {
    sendResponse("<PONG>");
    return;
  }

  // 4. Status Query
  if (cmd == "STATUS" || cmd == "GET_STATUS") {
    char buf[64];
    snprintf(buf, sizeof(buf), "<STATUS:P:%.1f,T:%.1f,M:%d,E:%d>",
             currentPanAngle, currentTiltAngle, isMoving ? 1 : 0, isEmergencyStop ? 1 : 0);
    sendResponse(String(buf));
    return;
  }

  // 5. Center Command
  if (cmd == "CENTER") {
    targetPanAngle = 90.0;
    targetTiltAngle = 90.0;
    movementSpeed = 80;
    isMoving = true;
    sendResponse("<ACK:CENTER>");
    return;
  }

  // 6. Stop Command
  if (cmd == "STOP") {
    targetPanAngle = currentPanAngle;
    targetTiltAngle = currentTiltAngle;
    isMoving = false;
    sendResponse("<ACK:STOP>");
    return;
  }

  // 7. Pan-only Command: <PAN:90.0,S:80>
  if (cmd.startsWith("PAN:")) {
    float newPan = targetPanAngle;
    int newSpeed = movementSpeed;
    int sIdx = cmd.indexOf(",S:");
    if (sIdx > 0) {
      newPan = cmd.substring(4, sIdx).toFloat();
      newSpeed = cmd.substring(sIdx + 3).toInt();
    } else {
      newPan = cmd.substring(4).toFloat();
    }
    targetPanAngle = constrain(newPan, 0.0, 180.0);
    movementSpeed = constrain(newSpeed, 1, 100);
    isMoving = true;
    char buf[32];
    snprintf(buf, sizeof(buf), "<ACK:PAN:%.1f>", targetPanAngle);
    sendResponse(String(buf));
    return;
  }

  // 8. Tilt-only Command: <TILT:90.0,S:80>
  if (cmd.startsWith("TILT:")) {
    float newTilt = targetTiltAngle;
    int newSpeed = movementSpeed;
    int sIdx = cmd.indexOf(",S:");
    if (sIdx > 0) {
      newTilt = cmd.substring(5, sIdx).toFloat();
      newSpeed = cmd.substring(sIdx + 3).toInt();
    } else {
      newTilt = cmd.substring(5).toFloat();
    }
    targetTiltAngle = constrain(newTilt, 0.0, 180.0);
    movementSpeed = constrain(newSpeed, 1, 100);
    isMoving = true;
    char buf[32];
    snprintf(buf, sizeof(buf), "<ACK:TILT:%.1f>", targetTiltAngle);
    sendResponse(String(buf));
    return;
  }

  // 9. Combined Position Command: P:90.0,T:90.0,S:100[,C:XX]
  if (cmd.startsWith("P:") && cmd.indexOf(",T:") > 0) {
    int cIdx = cmd.lastIndexOf(",C:");
    if (cIdx > 0) {
      String payload = cmd.substring(0, cIdx);
      String chkHexStr = cmd.substring(cIdx + 3);
      uint8_t receivedChk = (uint8_t)strtol(chkHexStr.c_str(), NULL, 16);
      uint8_t calculatedChk = computeChecksum(payload);

      if (receivedChk != calculatedChk) {
        sendResponse("<ERR:CHECKSUM_MISMATCH>");
        return;
      }
      cmd = payload;
    }

    float newPan = targetPanAngle;
    float newTilt = targetTiltAngle;
    int newSpeed = movementSpeed;

    int pStart = 2;
    int tStart = cmd.indexOf(",T:");
    if (tStart > pStart) {
      newPan = cmd.substring(pStart, tStart).toFloat();
    }

    int sStart = cmd.indexOf(",S:", tStart);
    if (sStart > tStart) {
      newTilt = cmd.substring(tStart + 3, sStart).toFloat();
      newSpeed = cmd.substring(sStart + 3).toInt();
    } else {
      newTilt = cmd.substring(tStart + 3).toFloat();
    }

    newPan = constrain(newPan, 0.0, 180.0);
    newTilt = constrain(newTilt, 0.0, 180.0);
    newSpeed = constrain(newSpeed, 1, 100);

    targetPanAngle = newPan;
    targetTiltAngle = newTilt;
    movementSpeed = newSpeed;
    isMoving = true;

    char buf[32];
    snprintf(buf, sizeof(buf), "<ACK:POS:%.1f,%.1f>", targetPanAngle, targetTiltAngle);
    sendResponse(String(buf));
    return;
  }

  // 10. Gesture Command: <GESTURE:yes>, <GESTURE:nod>, <GESTURE:no>, <GESTURE:shake>
  if (cmd.startsWith("GESTURE:")) {
    String gName = cmd.substring(8);
    gName.trim();
    String gLower = gName;
    gLower.toLowerCase();

    if (gLower == "yes" || gLower == "nod" || gLower == "yes_nod") {
      executeYesNod();
      sendResponse("<ACK:GESTURE:YES>");
      return;
    } else if (gLower == "no" || gLower == "shake" || gLower == "no_shake") {
      executeNoShake();
      sendResponse("<ACK:GESTURE:NO>");
      return;
    }

    sendResponse("<ACK:GESTURE:" + gName + ">");
    return;
  }

  // 11. Configuration Commands: SWAP_AXIS, INVERT_PAN, INVERT_TILT
  if (cmd.startsWith("SWAP_AXIS:") || cmd.startsWith("SWAP_PINS:")) {
    int val = cmd.substring(cmd.indexOf(':') + 1).toInt();
    swapAxisPins = (val == 1);
    Serial.printf("[Config] Swap Axis Pins: %s\n", swapAxisPins ? "ENABLED (GPIO18=Tilt, GPIO19=Pan)" : "DISABLED (GPIO18=Pan, GPIO19=Tilt)");
    sendResponse(String("<ACK:SWAP_AXIS:") + (swapAxisPins ? "1>" : "0>"));
    return;
  }

  if (cmd.startsWith("INVERT_PAN:")) {
    int val = cmd.substring(11).toInt();
    invertPan = (val == 1);
    sendResponse(String("<ACK:INVERT_PAN:") + (invertPan ? "1>" : "0>"));
    return;
  }

  if (cmd.startsWith("INVERT_TILT:")) {
    int val = cmd.substring(12).toInt();
    invertTilt = (val == 1);
    sendResponse(String("<ACK:INVERT_TILT:") + (invertTilt ? "1>" : "0>"));
    return;
  }

  sendResponse("<ERR:UNKNOWN_CMD:" + cmd + ">");
}

void updateServoMovement() {
  if (!isMoving || isEmergencyStop) return;

  unsigned long now = millis();
  int stepIntervalMs = map(movementSpeed, 1, 100, 45, 8);

  if (now - lastStepTime >= (unsigned long)stepIntervalMs) {
    lastStepTime = now;

    float panDiff = targetPanAngle - currentPanAngle;
    float tiltDiff = targetTiltAngle - currentTiltAngle;

    float maxStep = 2.0;

    if (abs(panDiff) > maxStep) {
      currentPanAngle += (panDiff > 0) ? maxStep : -maxStep;
    } else {
      currentPanAngle = targetPanAngle;
    }

    if (abs(tiltDiff) > maxStep) {
      currentTiltAngle += (tiltDiff > 0) ? maxStep : -maxStep;
    } else {
      currentTiltAngle = targetTiltAngle;
    }

    // Apply software inversion if enabled
    float writePan = invertPan ? (180.0 - currentPanAngle) : currentPanAngle;
    float writeTilt = invertTilt ? (180.0 - currentTiltAngle) : currentTiltAngle;

    // Apply pin swapping if motor 1 and motor 2 are wired conversely
    if (swapAxisPins) {
      servoPan.write((int)round(writeTilt)); // GPIO 18 outputs Tilt
      servoTilt.write((int)round(writePan)); // GPIO 19 outputs Pan
    } else {
      servoPan.write((int)round(writePan));  // GPIO 18 outputs Pan
      servoTilt.write((int)round(writeTilt)); // GPIO 19 outputs Tilt
    }

    if (abs(currentPanAngle - targetPanAngle) < 0.2 && abs(currentTiltAngle - targetTiltAngle) < 0.2) {
      currentPanAngle = targetPanAngle;
      currentTiltAngle = targetTiltAngle;
      isMoving = false;
      digitalWrite(PIN_LED_STATUS, LOW);
      char buf[32];
      snprintf(buf, sizeof(buf), "<POS:%.1f,%.1f>", currentPanAngle, currentTiltAngle);
      sendResponse(String(buf));
    } else {
      digitalWrite(PIN_LED_STATUS, HIGH);
    }
  }
}


void broadcastTelemetry() {
  if (!isMoving) return;
  unsigned long now = millis();
  if (now - lastTelemetryTime >= 100) {
    lastTelemetryTime = now;
    char buf[32];
    snprintf(buf, sizeof(buf), "<POS:%.1f,%.1f>", currentPanAngle, currentTiltAngle);
    sendResponse(String(buf));
  }
}

// -----------------------------------------------------------------------------
// PREDEFINED HUMAN GESTURE ROUTINES (YES NOD & NO SHAKE)
// -----------------------------------------------------------------------------

void executeYesNod() {
  // YES Gesture: Smooth up-and-down vertical nod (Tilt moves, Pan locked)
  float basePan = currentPanAngle;
  float nodWaypoints[] = {115.0, 65.0, 110.0, 70.0, 90.0};
  int waypointCount = 5;

  for (int i = 0; i < waypointCount; i++) {
    if (isEmergencyStop) break;
    targetPanAngle = basePan;
    targetTiltAngle = nodWaypoints[i];
    movementSpeed = 85;
    isMoving = true;
    while (isMoving && !isEmergencyStop) {
      updateServoMovement();
      delay(4);
    }
    delay(80);
  }
}

void executeNoShake() {
  // NO Gesture: Smooth left-and-right horizontal shake (Pan moves, Tilt locked)
  float baseTilt = currentTiltAngle;
  float shakeWaypoints[] = {125.0, 55.0, 120.0, 60.0, 90.0};
  int waypointCount = 5;

  for (int i = 0; i < waypointCount; i++) {
    if (isEmergencyStop) break;
    targetPanAngle = shakeWaypoints[i];
    targetTiltAngle = baseTilt;
    movementSpeed = 85;
    isMoving = true;
    while (isMoving && !isEmergencyStop) {
      updateServoMovement();
      delay(4);
    }
    delay(80);
  }
}



