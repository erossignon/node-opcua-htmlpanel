var opcua = require("node-opcua");
var async = require("async");
var color = require("colors");


class OPCUADemo {
  constructor(nodeIdToMonitor) {
    this.nodeIdToMonitor = nodeIdToMonitor

    this.client = new opcua.OPCUAClient({})

    this.hostname = require("os").hostname().toLowerCase()
    this.endpointUrl = "opc.tcp://" + this.hostname + ":26543/UA/SampleServer"

    this.subscription = null
    this.session = null

    this.userIdentity  = null
    //xx this.userIdentity = { userName: "opcuauser", password: "opcuauser" };
  }

  opcClientConnect(callback) {
    console.log(" connecting to ", this.endpointUrl.cyan.bold);
    this.client.connect(this.endpointUrl, callback);
  }

  opcClientCreateSession(callback) {
    // How to access an object property from a callback function inside its method?
    // https://stackoverflow.com/a/3484433/3516684
    var thisObj = this

    this.client.createSession(demo.userIdentity,function (err,session) {
        console.log("Error: ", err)
        if (!err) {
            thisObj.session = session;
            console.log(" session created".yellow);
        }
        callback(err);
    });
  }

  opcClientCreateSubscription(callback) {
    const settings =
    {
      requestedPublishingInterval: 2000,
      requestedMaxKeepAliveCount:  2000,
      requestedLifetimeCount:      6000,
      maxNotificationsPerPublish:  1000,
      publishingEnabled: true,
      priority: 10
    }
    this.subscription=new opcua.ClientSubscription(this.session, settings);
    //xx the_subscription.monitor("i=155",DataType.Value,function onchanged(dataValue){
    //xx    console.log(" temperature has changed " + dataValue.value.value);
    //xx });
    this.subscription.on("started", () => {
                        console.log("subscription started");
                        callback();
                      })
                     .on("keepalive", () => {
                       console.log("keepalive");
                      })
                     .on("terminated", () => {
                       console.log(" TERMINATED ------------------------>")
                      });
  }

  getMonitoredItem() {
    return this.subscription.monitor(
        {
            nodeId: this.nodeIdToMonitor,
            attributeId: 13
        },
        {
            samplingInterval: 100,
            discardOldest: true,
            queueSize: 100
        },
        opcua.read_service.TimestampsToReturn.Both, (err) => {
            if (err) {
                console.log("Monitor  "+ this.nodeIdToMonitor.toString() +  " failed");
                console.log("ERr = ",err.message);
            }
        });
  }

  start() {
    async.series(
      [
        this.opcClientConnect.bind(demo),
        this.opcClientCreateSession.bind(demo),
        this.opcClientCreateSubscription.bind(demo)
      ],
      err => err ? console.log(err) : new WebSocketServiceLayer(this.getMonitoredItem())
    );
  }

}

const demo = new OPCUADemo("ns=1;s=Temperature")
demo.start()

class WebSocketServiceLayer {
  constructor(monitoredItem) {
    var express = require("express");
    var port = 3700;

    var app = express();
    app.get("/", function(req, res){
        res.send("It works!");
    });

    app.use(express.static(__dirname + '/'));

    var io = require('socket.io').listen(app.listen(port));
    console.log("Listening on port " + port);

    io.sockets.on('connection', socket => {
    // socket.on('send', function (data) {
    //    io.sockets.emit('message', data);
    // });
    });

    monitoredItem.on("changed", dataValue => {

        console.log(" value has changed " +  dataValue.toString());

        io.sockets.emit('message', {
            value: dataValue.value.value,
            timestamp: dataValue.serverTimestamp,
            nodeId: demo.nodeIdToMonitor.toString(),
            browseName: "Temperature"
        });
    });
  }
}
