# Betaflight PID Slider Simulator

A small static web app that simulates Betaflight's simplified PID tuning sliders.

Use it online at https://jp39.github.io/bf-pid-sliders/.

The calculations are based on the local Betaflight firmware implementation in
`src/main/config/simplified_tuning.c`, using the defaults from `flight/pid.h`
and `sensors/gyro.h`.

Open `index.html` in a browser to run it.
