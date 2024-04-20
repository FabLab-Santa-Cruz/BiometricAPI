//node --env-file=.env index.mjs
import ZKLib from "zklib-js";
import dayjs from "dayjs";
import { COMMANDS } from "zklib-js/constants.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import express from "express";
dayjs.extend(utc);
dayjs.extend(timezone);
console.log(process.env.BIO_IP);
console.log(process.env.API_KEY);
console.log(process.env.PORT, "le port");
const test = async () => {
  const app = express();
  const port = process.env.PORT;
  //=================AUTH===================
  app.all("*", checkUser);
  function checkUser(req, res, next) {
    const apiKey = req.headers["api-key"];
    if (apiKey !== process.env.API_KEY) {
      return res.status(401).send("Unauthorized");
    }
    next();
  }
  //=================AUTH===================

  console.log("Instance created");
  const zkInstance = new ZKLib(process.env.BIO_IP, 4370, 5200, 5000);
  try {
    console.log("Connecting to machine");
    // Create socket to machine
    await zkInstance.createSocket();
    // Get general info like logCapacity, user counts, logs count
    // It's really useful to check the status of device
    console.log(await zkInstance.getInfo());
  } catch (e) {
    console.log(e);
    if (e.code === "EADDRINUSE") {
    }
  }
  /**
   * Get the current time in the machine for the U560C device.
   * https://github.com/adrobinoga/zk-protocol/blob/master/sections/terminal.md
   * The time is the number of seconds since 21 aug 1999, generally its 1970-01-01 00:00:00 UTC but zkteco decided 21 aug 1999 00:00:00. So, we have to add 935,193,600,000 to get the real time in the machine
   * Be careful, it returns as the CURRENT CONFIGURED time in the U560C device
   * @returns {Promise<Date>}
   */
  async function getTime560c() {
    const time = await zkInstance.executeCmd(COMMANDS.CMD_GET_TIME, "");
    return new Date(935_193_600_000 + time.readUInt32LE(8) * 1000);
  }
  /**
   * Receives a date and sets the time in the machine for the U560C device (Precision of seconds only)
   * @param date {Date}
   */
  async function setTime560c(date) {
    const time = Math.round(date.getTime() / 1000 - 935_193_600);
    const timeBuffer = Buffer.alloc(4);
    timeBuffer.writeUInt32LE(time, 0);
    // @ts-ignore
    await zkInstance.executeCmd(COMMANDS.CMD_SET_TIME, timeBuffer);
  }
  try {
    await zkInstance.getRealTimeLogs(async (data) => {
      //Post to BACKEND_ENDPOINT
      if (process.env.BACKEND_ENDPOINT === undefined) {
        console.warn("BACKEND_ENDPOINT is not defined");
        console.log(data);
        return;
      }
      if (process.env.API_KEY === undefined) {
        console.warn("API_KEY is not defined");
        console.log(data);
        return;
      }
      await fetch(process.env.BACKEND_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.API_KEY,
        },
        body: JSON.stringify(data),
      });
      console.log(data);
    });
  } catch (e) {
    console.error(e);
  }
  /**
   * Create new user
   * @param {number} uid
   * @param {string} userid
   * @param {string} name
   * @param {string} password
   * @param {number} role
   * @param {number} cardno
   */
  app.post("/upsert_user", async (req, res) => {
    const { uid, userid, name, password, role = 0, cardno = 0 } = req.query;
    if (!uid || !userid || !name || !password) {
      return res.status(400).send("Missing parameters");
    }
    if (typeof role !== "number" || typeof cardno !== "number") {
      return res.status(400).send("Invalid role or cardno");
    }
    await zkInstance.setUser(uid, userid, name, password, role, cardno);
    res.send("User created");
  });
  app.get("/get_users", async (req, res) => {
    const users = await zkInstance.getUsers();
    res.send(users);
  });
  app.get("/get_date", async (req, res) => {
    const date = await getTime560c();
    res.send(date);
  });
  /**
   * Set the time in the machine for the U560C device
   * date is a string in the format "2022-01-01T00:00:00.000Z"
   * @param {Date} date
   * @throws {Error}
   */
  app.post("/set_date", async (req, res) => {
    const { date } = req.query;
    if (!date) {
      return res.status(400).send("Missing parameters");
    }
    if (typeof date !== "string") {
      return res.status(400).send("Invalid date");
    }
    if (!dayjs(date).isValid()) {
      return res.status(400).send("Invalid date");
    }
    const dateObj = dayjs(date).toDate();
    if (isNaN(dateObj.getTime())) {
      return res.status(400).send("Invalid date");
    }
    await setTime560c(dateObj);
    res.send("Date set");
  });
  //Flush logs
  app.get("/flush_logs", async (req, res) => {
    await zkInstance.clearAttendanceLog();
    res.send("Logs flushed");
  });
  app.listen(port, () => {
    console.log(`Example app listening at port: ${port}`);
  });
};
test(); // in the end we execute the function
