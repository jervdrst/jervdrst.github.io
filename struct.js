/*
    Warning I'm new to JS so don't be mad if it goes wrong :)
*/

class nodeWifiConfig{
    static stringLength = 32;
    static normalLength = 67;

    constructor(){
        this.valid  = true;
        this.nodeID = 0;
        this.ssid   = "???";
        this.pass   = "???";
        this.nopass = false;
    }

    parseData(data){
        console.log("Parse data:", data);
        this.valid  = Boolean(data.shift());
        this.nodeID = data.shift();
        this.ssid   = readString(data.splice(0,nodeWifiConfig.stringLength));
        this.pass   = readString(data.splice(0,nodeWifiConfig.stringLength));
        this.nopass = Boolean(data.shift());

        return this;
    }

    create(nodeID, ssid, pass){
        // this.valid  = true,
        this.nodeID = nodeID,
        this.ssid   = ssid,
        this.pass   = pass,
        this.nopass = (pass === null);
    }

    generateBytes(){
        let encoder = new TextEncoder();
        let out = new Uint8Array(nodeWifiConfig.normalLength);
        out.fill(0);

        out[0] = Boolean(this.valid);
        out[1] = this.nodeID;
        const ssid_encoded = encoder.encode(this.ssid);
        for (let i = 0; i < ssid_encoded.length; i++){
            out[i + 2] = ssid_encoded[i];
        }

        if (!this.nopass){
            const pass_encoded = encoder.encode(this.pass);

            for (let i = 0; i < pass_encoded.length; i++){
                out[i + 2 + nodeWifiConfig.stringLength] = pass_encoded[i];
            }
            out[nodeWifiConfig.normalLength-1] = 0x00;
        } else {
            out[nodeWifiConfig.normalLength-1] = 0x01;
        }

        return out;
    }
}


function readString(data)
{
    EOFindex = data.indexOf(0x00);
    let decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(data.splice(0,EOFindex)));
}
