// Data types shared by the sketch (kept in a header so Arduino's generated prototypes can see them).
#pragma once
#include <stdint.h>

struct Reading { uint32_t t; float v; char k; };
struct Reminder { char id[37]; uint32_t at; char name[21]; char dose[21]; bool done; uint32_t snoozeUntil; };
struct Ack { char id[37]; bool taken; };
struct Button { int pin; bool down; uint32_t since; bool longFired; };
