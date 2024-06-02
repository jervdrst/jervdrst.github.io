// inspiration from https://github.com/rafaelaroca/web-serial-terminal/blob/master/index.html
var seawaveOffset = 3;

var port;
var reader;
var writer;
var encoder = new TextEncoder();
var decoder = new TextDecoder();

var queue = [];
var newData = false;
var busy = false;

var config = new nodeWifiConfig();


function installSerial(){
    if(!("serial" in navigator)){
        console.log("sad times");
        alert("The reconfigurator doesn't work in this browser. Please use a chromium based browser.")
        return;
    }
    console.log("serial supported");

    //https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
    navigator.serial.addEventListener("connect", async (e) => {
        // Connect to `e.target` or add it to a list of available ports.
        console.log("connected");

        port = e.target;
        // try{
        await onPortConnect(e.target);
        // } catch (e) {
        //   console.log("Error");
        //   console.log(e);
        // }
      });
      
      navigator.serial.addEventListener("disconnect", (e) => {
        // Remove `e.target` from the list of available ports.
        console.log("disconnected");
        if(e.target == port){
          busy = false;
        }
      });
      
      // step 1
      var button = document.getElementById("pairButton");

      button.addEventListener("click", () => {
        // const usbVendorId = 0xabcd;
        navigator.serial
          .requestPort({ filters: [{ usbVendorId: 0x239A, usbProductId: 0x800B}] })
          // .requestPort()
          .then(async (port) => {
            // Connect to `port` or add it to the list of available ports.
            // await port.open({baudRate:9600});
            // console.log("is open?");
            alert("Succesfully paired device\nPlease unplug and reinsert the device to enter update mode.");
          })
          .catch((e) => {
            // The user didn't select a port.
            console.log("error");
            console.log(e);
          });
      });
}

async function onPortConnect(port){
  console.log(port);

  // step 2 - open port
  await port.open({baudRate:38400});
  // reader = await port.readable.getReader();
  writer = await port.writable.getWriter();

  // write sync bytes
  const syncArray = new Uint8Array([0x01, 0x88, 0x99]);

  const appendStream = new WritableStream({
    write(chunk) {
      // add to array/queue instead
      // console.log(chunk);
      for(let i = 0; i < chunk.length; i++)
      {
        queue.push(chunk[i]);
      }
      newData = true;
    }
  })

  // keep reading and add all bytes to appendStream ( -> queue)
  port.readable.pipeTo(appendStream);

  while(true){
    await writer.write(syncArray);
    // const{value, done} = await reader.read();
    // console.log(value);
    
    // wait for 100 ms
    await new Promise((resolve) => setTimeout(resolve, 1000)); 
    if(!newData){
      continue;
    }
    newData = false;

    // check if 0x99 in value
    let syncpos = checkValueInArray(queue, 0x99)
    if (syncpos < -1){
      console.log("Not in array");
      // clear the array
      queue.splice(0,queue.length);
      continue;
    }

    if(queue[syncpos+1] == 0x77 && queue[syncpos+2] == 0x99){
      console.log("sync successfull");
      queue.splice(0, syncpos+2);
      break;
    }
    queue.splice(0, syncpos);
  }

  console.log("requesting current config");
  // now we will request the current config

  await writer.releaseLock();

  await getConfig();
}


async function getConfig(){
  if(!port || busy){
    return;
  }

  busy = true;
  document.getElementById("config-status").innerText = "⏳";

  const req = new Uint8Array([0x88, 0x01])
  let requestResponse;
  // reset queue
  queue = [];
  writer = port.writable.getWriter();
  await writer.write(req);
  // close the writer
  writer.releaseLock();
  console.log("req send");

  // wait a second for a response
  await new Promise((resolve) => setTimeout(resolve, 1000)); 
  console.log(queue);
  // first check for request 
  // TODO make function
  requestResponse = queue.shift();
  if (requestResponse != (0xF0 | req[1])){
    alert("Request failed");
    return;
  }

  // read data: expect 0x88 and than data until 0x99
  // remove 0x88;
  queue.shift();
  config.parseData(queue.splice(0, nodeWifiConfig.normalLength));
  // now add this to the board

  busy = false;

  // TODO: add to screen
  document.getElementById("nodeid").innerText = config.nodeID + "\t(SW" + (config.nodeID - seawaveOffset) + ")";
  document.getElementById("ssid").innerText   = config.ssid;
  document.getElementById("pass").innerText   = config.pass;
  document.getElementById("config-status").innerText = "✔️";
}

// function will be called after buttonpress
// TODO: Alter config
async function updateNewConfig(){
  if(!port || busy){
    // no port
    return;
  }

  // check if fields are filled
  let newssid = document.getElementById("new-ssid").value.trim();
  let newpass = document.getElementById("new-pass").value.trim();
  if(!newssid){
    alert("Invalid ssid");
    return;
  }

  busy = true;
  document.getElementById("update-status").innerText = "⏳";

  let newConfig = new nodeWifiConfig();
  newConfig.create(config.nodeID, newssid, newpass);

  const req = new Uint8Array([0x88, 0x02]);

  // reset queue
  queue = [];
  writer = port.writable.getWriter();
  await writer.write(req);

  console.log("req send");

  // wait a second for a response
  await new Promise((resolve) => setTimeout(resolve, 250)); 
  console.log(queue);
  // first check for request 
  // TODO make function
  let requestResponse = queue.shift();
  if (requestResponse != (0xF0 | req[1])){
    alert("Request failed");
    return;
  }
  
  queue = [];
  await writer.write(new Uint8Array([0x88, 0x03]));
  await writer.write(newConfig.generateBytes());
  await writer.write(new Uint8Array([0x99]));

  // close the writer
  writer.releaseLock();

  // wait for response
  await new Promise((resolve) => setTimeout(resolve, 250)); 
  requestResponse = queue.shift();
  if (requestResponse == 0x91){
    //TODO:
    document.getElementById("update-status").innerText = "✔️";
  } else {
    document.getElementById("update-status").innerText = "❌";
  }

  busy = false;

  await getConfig();

}


// TODO: save/cancel"
async function applyNewConfig(){
  if(!port || busy){
    // no port
    return;
  }

  busy = true;

  const req = new Uint8Array([0x88, 0x06]);

  // reset queue
  queue = [];
  writer = port.writable.getWriter();
  await writer.write(req);
  // close the writer
  writer.releaseLock();
  console.log("req send");
  
  busy = false;  
  queue = [];
  alert("Device will restart");
  // await port.readable.reader.releaseLock();
  // await port.close();
  port = null;
}




// return -1 if not found; 
function checkValueInArray(array, val){
  for(let i = 0; i < array.length; i++){
    if(array[i] == val){
     return i;
    }
  }
  return -1;
}

