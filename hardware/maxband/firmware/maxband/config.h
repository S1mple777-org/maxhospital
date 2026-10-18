// MaxBand settings you may need to change.
#pragma once

// Server function (Supabase project of MaxHospital). Change only if the backend moves.
#define SERVER_URL "https://sgmeuwbvfffopmczjwcv.supabase.co/functions/v1/device-api"

#define FIRMWARE_VERSION "maxband-1.0.0"

// Wi-Fi setup network the band opens on first start (connect with a phone and choose your Wi-Fi).
#define SETUP_AP_NAME "MaxBand-Setup"

// ---- Pins (ESP32-C3 SuperMini) ----------------------------------------------------
#define PIN_SDA 6        // I2C: OLED 0x3C, MAX30102 0x57, MPU6050 0x68
#define PIN_SCL 7
#define PIN_BTN_A 3      // OK / hold 3 s = SOS
#define PIN_BTN_B 4      // next screen / hold 3 s = "contact a doctor"
#define PIN_VIBRO 10     // vibration motor through an NPN transistor (S8050 / 2N2222)
#define PIN_BAT 0        // battery voltage through a 100k/100k divider (ADC1_CH0)

// Uncomment ONLY to debug TLS problems: the band will not check the server certificate.
// #define MAXBAND_INSECURE_TLS
