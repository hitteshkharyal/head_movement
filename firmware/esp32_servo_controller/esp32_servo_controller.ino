/*
  =============================================================================
  AI HUMANOID PRESENTATION ROBOT — ESP32 SERVO FIRMWARE
  =============================================================================
  Target Microcontroller : ESP32 Dev Module / ESP32-WROOM-32
  Servos Supported       : SG90, MG90S, MG995, MG996R (180° standard PWM)
  PWM Frequency          : 50 Hz (20ms period)
  Pulse Widths           : 500us (0°) to 2500us (180°)
  Default Signal Pins    : PAN -> GPIO 18 | TILT -> GPIO 19
  Baud Rate              : 115200 bps

  COMMUNICATION PROTOCOL:
  -----------------------------------------------------------------------------
  1. Pan & Tilt Command  : <P:90.0,T:90.0,S:100,C:XX>\n
     - P = Pan angle (0.0 - 180.0)
     - T = Tilt angle (0.0 - 180.0)
     - S = Speed percentage (1 - 100)
     - C = 2-digit Hex XOR Checksum of string between '<' and ',C:'
  2. Ping                : <PING>\n       -> Responds with: <PONG>\n
  3. Center              : <CENTER>\n     -> Responds with: <ACK:CENTER>\n
  4. Emergency Stop      : <!ESTOP>\n     -> Responds with: <!ESTOP_ACTIVE>\n
  5. Normal Stop         : <STOP>\n       -> Responds with: <ACK:STOP>\n
  =============================================================================
*/

#include <ESP32Servo.h>

// --- PIN DEFINITIONS ---
#define PIN_SERVO_PAN   18   // GPIO 18 for Pan (Yaw)
#define PIN_SERVO_TILT  19   // GPIO 19 for Tilt (Pitch)
#define PIN_LED_STATUS   2   // Built-in blue LED for connection/motion status

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
int   movementSpeed    = 100;
bool  isEmergencyStop  = false;
bool  isMoving         = false;

unsigned long lastStepTime = 0;
String inputBuffer = "";
bool stringComplete = false;

// Compute XOR Checksum of payload string
uint8_t computeChecksum(const String& payload) {
  uint8_t chk = 0;
  for (unsigned int i = 0; i < payload.length(); i++) {
    chk ^= (uint8_t)payload[i];
  }
  return chk;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_LED_STATUS, LOW);

  // Allow allocation of all timers
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servoPan.setPeriodHertz(SERVO_PWM_FREQ_HZ);
  servoTilt.setPeriodHertz(SERVO_PWM_FREQ_HZ);

  // Attach servos with defined pulse width limits
  servoPan.attach(PIN_SERVO_PAN, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  servoTilt.attach(PIN_SERVO_TILT, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);

  // Initialize at centered position (90°, 90°)
  servoPan.write((int)currentPanAngle);
  servoTilt.write((int)currentTiltAngle);

  // Flash status LED 3 times on boot
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED_STATUS, HIGH);
    delay(100);
    digitalWrite(PIN_LED_STATUS, LOW);
    delay(100);
  }

  Serial.println("<READY:ESP32_SERVO_CONTROLLER_V1.0>");
}

void loop() {
  // 1. Process serial commands
  readSerial();

  // 2. Smooth trajectory stepping toward targets
  updateServoMovement();
}

void readSerial() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '<') {
      inputBuffer = "";
    } else if (inChar == '>') {
      parseAndExecuteCommand(inputBuffer);
      inputBuffer = "";
    } else if (inChar != '\r' && inChar != '\n') {
      inputBuffer += inChar;
    }
  }
}

void parseAndExecuteCommand(String cmd) {
  cmd.trim();

  // Emergency Stop command
  if (cmd == "!ESTOP") {
    isEmergencyStop = true;
    isMoving = false;
    digitalWrite(PIN_LED_STATUS, HIGH); // Steady LED on E-Stop
    Serial.println("<!ESTOP_ACTIVE>");
    return;
  }

  // Resume / Clear Emergency Stop
  if (cmd == "RESUME") {
    isEmergencyStop = false;
    digitalWrite(PIN_LED_STATUS, LOW);
    Serial.println("<ACK:RESUME>");
    return;
  }

  if (isEmergencyStop) {
    Serial.println("<ERR:BLOCKED_BY_ESTOP>");
    return;
  }

  // Ping Command
  if (cmd == "PING") {
    Serial.println("<PONG>");
    return;
  }

  // Center Command
  if (cmd == "CENTER") {
    targetPanAngle = 90.0;
    targetTiltAngle = 90.0;
    movementSpeed = 80;
    isMoving = true;
    Serial.println("<ACK:CENTER>");
    return;
  }

  // Stop Command
  if (cmd == "STOP") {
    targetPanAngle = currentPanAngle;
    targetTiltAngle = currentTiltAngle;
    isMoving = false;
    Serial.println("<ACK:STOP>");
    return;
  }

  // Position Command: P:90.0,T:90.0,S:100,C:XX
  if (cmd.startsWith("P:") && cmd.indexOf(",T:") > 0) {
    // Check for checksum field
    int cIdx = cmd.lastIndexOf(",C:");
    if (cIdx > 0) {
      String payload = cmd.substring(0, cIdx);
      String chkHexStr = cmd.substring(cIdx + 3);
      uint8_t receivedChk = (uint8_t)strtol(chkHexStr.c_str(), NULL, 16);
      uint8_t calculatedChk = computeChecksum(payload);

      if (receivedChk != calculatedChk) {
        Serial.println("<ERR:CHECKSUM_MISMATCH>");
        return;
      }
      cmd = payload; // Strip checksum field for parsing
    }

    float newPan = targetPanAngle;
    float newTilt = targetTiltAngle;
    int newSpeed = movementSpeed;

    // Parse P:
    int pStart = 2;
    int tStart = cmd.indexOf(",T:");
    if (tStart > pStart) {
      newPan = cmd.substring(pStart, tStart).toFloat();
    }

    // Parse T:
    int sStart = cmd.indexOf(",S:", tStart);
    if (sStart > tStart) {
      newTilt = cmd.substring(tStart + 3, sStart).toFloat();
      newSpeed = cmd.substring(sStart + 3).toInt();
    } else {
      newTilt = cmd.substring(tStart + 3).toFloat();
    }

    // Validate boundaries (0 to 180 degrees)
    newPan = constrain(newPan, 0.0, 180.0);
    newTilt = constrain(newTilt, 0.0, 180.0);
    newSpeed = constrain(newSpeed, 1, 100);

    targetPanAngle = newPan;
    targetTiltAngle = newTilt;
    movementSpeed = newSpeed;
    isMoving = true;

    Serial.printf("<ACK:POS:%.1f,%.1f>\n", targetPanAngle, targetTiltAngle);
  }
}

void updateServoMovement() {
  if (!isMoving || isEmergencyStop) return;

  unsigned long now = millis();
  // Adjust step interval based on speed (100% speed = ~10ms/step, 10% = 50ms/step)
  int stepIntervalMs = map(movementSpeed, 1, 100, 50, 10);

  if (now - lastStepTime >= (unsigned long)stepIntervalMs) {
    lastStepTime = now;

    float panDiff = targetPanAngle - currentPanAngle;
    float tiltDiff = targetTiltAngle - currentTiltAngle;

    float maxStep = 2.0; // Max angle increment per tick (smooth movement)

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

    servoPan.write((int)round(currentPanAngle));
    servoTilt.write((int)round(currentTiltAngle));

    if (abs(currentPanAngle - targetPanAngle) < 0.2 && abs(currentTiltAngle - targetTiltAngle) < 0.2) {
      isMoving = false;
      digitalWrite(PIN_LED_STATUS, LOW);
    } else {
      digitalWrite(PIN_LED_STATUS, HIGH); // Blink/On while moving
    }
  }
}
