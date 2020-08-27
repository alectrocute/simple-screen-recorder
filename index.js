"use strict";

const { app, protocol, Menu, Tray, Notification } = require("electron");
const isDevelopment = process.env.NODE_ENV !== "production";
const aperture = require("aperture");
const recorder = aperture();
const open = require("open");
const fs = require("fs");

let stopFlag = false;
let stopFlagWatcher = null;

let isRecording = false;

let tray;

const getAvailableDevices = async () => {
  return {
    audio: await aperture.audioDevices(),
    screen: await aperture.screens(),
    videoCodecs: aperture.videoCodecs,
  };
};

const availableCodecs = ["hevc", "h264", "proRes422", "proRes4444"];

let preferences = {
  microphone: null,
  display: null,
  codec: null,
};

function setAsPreferred(type, val) {
  console.log("[prefs] Setting preference for " + type + " as " + val);
  preferences[type] = val;
  console.info(preferences);
}

function convertDeviceToMenuItem(item, t) {
  return {
    label: item.name || item,
    type: "radio",
    checked: preferences[t] == item,
    click() {
      setAsPreferred(t, item);
    },
  };
}

const notify = (text, silent) => {
  console.log(`[notifications], "${text}", silent: ${silent}`);
  const notification = new Notification({
    title: app.name,
    body: text,
    silent: silent,
  });

  notification.show();
};

const startRecording = async () => {
  await recorder.startRecording({
    fps: 30,
    audioDeviceId: preferences.microphone
      ? preferences.microphone.id
      : undefined,
  });

  notify("Recording started!", true);
  updateTray();

  stopFlagWatcher = setInterval(async () => {
    if (stopFlag == true) {
      stopFlag = false;

      const file = await recorder.stopRecording();

      fs.rename(
        file,
        app.getPath("desktop") +
          "/" +
          file.split("/")[file.split("/").length - 1],
        function () {}
      );

      open(
        app.getPath("desktop") +
          "/" +
          file.split("/")[file.split("/").length - 1]
      );

      fs.unlink(file, function () {});

      notify("Recording stopped!", false);
      clearInterval(stopFlagWatcher);
      updateTray();
    }
    return;
  }, 2000);
};

const stopRecording = () => {
  stopFlag = true;
};

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } },
]);

async function createTray() {
  tray = new Tray("./public/tray.png");
  updateTray();
}

async function updateTray() {
  const avail = await getAvailableDevices();

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Recorder – ${isRecording ? "Active" : "Idle"}`,
        enabled: false,
      },
      {
        type: "separator",
      },
      {
        label: "Microphone",
        submenu: avail.audio.map((x) =>
          convertDeviceToMenuItem(x, "microphone")
        ),
        enabled: !isRecording,
      },
      {
        label: "Display",
        submenu: avail.screen.map((x) => convertDeviceToMenuItem(x, "display")),
        enabled: !isRecording,
      },
      {
        label: "Codec",
        submenu: availableCodecs.map((x) =>
          convertDeviceToMenuItem(x, "codec")
        ),
        enabled: !isRecording,
      },
      {
        type: "separator",
      },
      {
        label: "Start Recording",
        enabled: !isRecording,

        click() {
          isRecording = true;
          updateTray();
          startRecording();
        },
      },
      {
        label: "Stop Recording",
        enabled: isRecording,
        click() {
          stopRecording();
          isRecording = false;
          updateTray();
        },
      },
      {
        type: "separator",
      },
      {
        label: "Quit",
        enabled: !isRecording,
        click() {
          app.quit();
        },
      },
    ])
  );
}

app.whenReady().then(async () => {
  if (process.platform !== "darwin") app.quit();

  console.info("[app] launched");
  await createTray();
  app.dock.hide();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}
