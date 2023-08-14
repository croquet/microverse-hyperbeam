class HyperbeamPawn {
    setup() {
        // prelude.js installs hyperbeam library
        this.openBrowser();

        this.addEventListener("pointerDown", "pointerDown");
        this.addEventListener("pointerTap", "pointerTap");
        this.addEventListener("pointerMove", "pointerMove");
        this.addEventListener("pointerUp", "pointerUp");
        this.addEventListener("pointerWheel", "pointerWheel");
    }

    getEmbedURL() {
        this.ensureConfig().then(() => this.hyperbeamApiKey)
            .then((apiKey) => fetch("https://engine.hyperbeam.com/v0/vm", {
                method: "POST",
                mode: "cors",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                }
            }))
            .then((response) => response.json());
    }

    ensureConfig() {
        if (this.configPromise) {
            return this.configPromise;
        }
        let loc = window.location;
        let proto = loc.protocol;
        let host = loc.host;
        let pathname = loc.pathname;
        let ind = pathname.lastIndexOf("/");
        pathname = pathname.slice(0, ind);

        let url = `${proto}//${host}${pathname}/hyperbeamSession.js`;
        
        this.configPromise = import(url).then((mod) => {
            this.hyperbeamApiKey = mod.hyperbeamApiKey;
            this.hyperbeamSession = mod.hyperbeamSession;
            return this.hyperbeamSession;
        });
        return this.configPromise;
    }

    async openBrowser() {
        await window.hyperbeamPromise;
        // let json = await this.getEmbedURL();

        let config = await this.ensureConfig();

        let json = config;
        console.log(json);

        // The embedURL is retrieved from the REST API
        // Documentation for the REST API can be found here:
        // docs.hyperbeam.com/rest-api
        const embedURL = json.embed_url;
        const admin_token = json.admin_token;

        let container = document.createElement("div");
        container.width = "800px";
        container.id = "hyperbeam-container";

        document.body.appendChild(container);

        const hb = await window.Hyperbeam(container, embedURL, {
            // Number of milliseconds until the request to the virtual browser times out.
            // If the request times out, the returned promise will be rejected.
            timeout: 5000, // default = 2000

            // An admin token returned from the REST API that will grant this user
            // access to managing user permissions and programmatic navigation.
            adminToken: admin_token,

            // Starting volume of the virtual browser
            volume: 0.2,         // default = 1.0

            // Starting video pause state of the virtual browser
            videoPaused: false,  // default = false

            // delegate global keyboard events to the embed
            delegateKeyboard: true, // default = true

            // Callback called with the virtual computer's video frame data
            // For Chromium-based browsers, its type is ImageBitmap
            // For other browsers, it's a HTMLVideoElement
            // Most frameworks like Three.js and Babylon.js can handle both types automatically

            frameCb: (frame) => {
                this.updateWithFrame(frame);
            },

            // Callback called with an MediaStreamTrack of the virtual computer's audio stream
            audioTrackCb: (track) => {},

            // Data to be provided to your webhook endpoint if you're using webhook authentication
            webhookUserdata: {myAppData: {user: "your-app-user-id"}},

            // Callback called when another user moves their mouse cursor on top of the virtual browser
            // Useful for implementing multiplayer cursors
            onCursor: ({ x, y, userId }) => {},

            // Callback called when the user disconnects from the virtual browser
            // type is an enum with one of the following values:
            //   "request"  -> virtual browser was manually shut down
            //   "inactive" -> inactive timeout was triggered
            //   "absolute" -> absolute timeout was triggered
            //   "kick"     -> user was kicked from the session
            onDisconnect: ({ type }) => {},

            // Callback called when a timeout either surpasses the warning threshold,
            // or has been reset and is no longer passed the warning threshold.
            //
            // type is an enum that refers to the timeout's type tied to the event
            // possible values are "inactive" and "absolute"
            //
            // deadline = null | { delay: number, closeDate: string }
            // If deadline is null, then the timeout was reset and is no longer
            // passed the warning threshold. If deadline is set, deadline.delay
            // is the number of milliseconds until the timeout is triggered,
            // and closeDate is an RFC3339 formatted string of when the timeout will occur
            onCloseWarning: ({ type, deadline }) => {},

            // Callback called when the connection state of the video stream has changed
            // state = "connecting" | "playing" | "reconnecting"
            //
            // You can use this to show custom reconnecting UI, and detecting if a user
            // has a sub-optimal connection to the virtual browser
            onConnectionStateChange: ({ state }) => {}
        }).catch((error) => console.log(error));

        console.log(hb);
        this.hb = hb;
    }

    updateWithFrame(frame) {
        if (this.texture.image === null) {
            if (frame.constructor === HTMLVideoElement) {
                // hack: three.js internal methods check for .width and .height
                // need to set manually for video so that three.js handles it correctly
                frame.width = frame.videoWidth;
                frame.height = frame.videoHeight;
            }
            this.texture.image = frame;
            this.texture.needsUpdate = true;
        } else {
            let ctx = this.canvas.getContext("2d");
            ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, this.canvas.width, this.canvas.height);
            this.texture.flipY = true;
            this.texture.needsUpdate = true;
        }
    }

    makeNewTextureIfNecessary(frame) {
        if (this.texture) {
            if (this.texture.canvas.width === frame.width &&
                this.texture.canvas.height === frame.height) {
                return;
            }
        }
    }

    cookPosition(xyz) {
        let vec = new Microverse.THREE.Vector3(...xyz);
        let inv = this.renderObject.matrixWorld.clone().invert();
        let vec2 = vec.applyMatrix4(inv);

        console.log(vec2);

        let aspect = this.actor._cardData.textureHeight / this.actor._cardData.textureWidth;
        let x, y;
        if (aspect >= 1) {
            x = (vec2.x * aspect + 0.5) * 1;
            y = (-vec2.y + 0.5) * 1;
        } else {
            x = (vec2.x + 0.5) * 1;
            y = (-vec2.y / aspect + 0.5) * 1;
        }

        console.log(x, y);

        return {x, y};
    }

    cookEvent(type, evt) {
        if (!evt.xyz) {return null;}
        let xy = this.cookPosition(evt.xyz);

        let evMap = {
            pointerDown: "mousedown",
            pointerUp: "mouseup",
            pointerMove: "mousemove",
            pointerTap: "click",
            // pointerWheel: "wheel"
        }

        let mapped = evMap[type];
        if (!mapped) {return null;}

        if (mapped === "wheel") {
            return {type: mapped, deltaY: evt.deltaY}
        }

        return {type: mapped, ...xy, button: 0};
    }

    pointerDown(evt) {
        let cooked = this.cookEvent("pointerDown", evt);
        if (!cooked) {return;}
        if (!this.hb) {return;}
        this.hb.sendEvent(cooked);
    }

    pointerUp(evt) {
        let cooked = this.cookEvent("pointerUp", evt);
        if (!cooked) {return;}
        if (!this.hb) {return;}
        this.hb.sendEvent(cooked);
    }

    pointerTap(evt) {
        let cooked = this.cookEvent("pointerTap", evt);
        if (!cooked) {return;}
        if (!this.hb) {return;}
        this.hb.sendEvent(cooked);
    }

    pointerMove(evt) {
        if (this.lastPointerMove == undefined) {
            this.lastPointerMove = 0;
        }
        let now = Date.now();
        if (now - this.lastPointerMove < 100) {
            return;
        }
        let cooked = this.cookEvent("pointerMove", evt);
        console.log(now, cooked);
        if (!cooked) {return;}
        if (!this.hb) {return;}
        this.lastPointerMove = now;
        this.hb.sendEvent(cooked);
    }

    pointerWheel(evt) {
        if (this.lastPointerMove == undefined) {
            this.lastPointerMove = 0;
        }
        let now = Date.now();
        if (now - this.lastPointerMove < 100) {
            return;
        }
        let cooked = this.cookEvent("pointerWheel", evt);
        console.log(now, cooked);
        if (!cooked) {return;}
        if (!this.hb) {return;}
        this.lastPointerMove = now;
        this.hb.sendEvent(cooked);
    }
}

export default {
    modules: [
        {
            name: "Hyperbeam",
            pawnBehaviors: [HyperbeamPawn]
        }
    ]
}

/* globals Microverse */
