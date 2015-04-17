var port = "8003";
var url = 'http://localhost:' + port;
var socketio = require('socket.io-client');
var socket = socketio(url);
var command;  //socket to send commands on
var initData;
var selectedPlayer;


var connected = false;

var playerSelection;
if (process.argv[2]) {
	//Identify which tank this script will apply to
	// this is passed in via the command line. 
	// red = 0, blue = 1, green =2, purple = 3
	playerSelection = parseInt(process.argv[2], 10);
}

var enemyBases = [];
var myTanks = [];
var enemyTanks = [];
var allBases = [];
var myBase = [];
socket.on("init", function(initD) {
	if (connected) {
		return false;
	}
	socket.on("disconnect", function() {
		//process.exit(1);
	});
	connected = true;
	initData = initD;
	selectedPlayer = initData.players[playerSelection];
	command = socketio(url + "/" + selectedPlayer.namespace);
	enemyBases = initData.players.filter(function(p) {
		return selectedPlayer.playerColor !== p.playerColor;
	});
	myBase = initData.players.filter(function(p) {
		return selectedPlayer.playerColor == p.playerColor;
	})[0];
	allBases = initData.players;
	var serverTanks = initData.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});
	for (var i = 0; i < serverTanks.length; i++) {
		myTanks.push(new Tank(i));
	}

	setTimeout(function() {
		startInterval();
	}, 500);
	console.log(myBase);
});


/*** AI logic goes after here ***/

/** send back to server **/
function startInterval() {
	setInterval(function() {
		sendBackCommands();
	}, 500);

	setInterval(function() {
		fire();
	}, 500);

	setInterval(function() {
		unStick();
	}, 500);
}

function sendBackCommands() {
	//add up all calculations
	var speed, angleVel, orders;
	for (var i = 0; i < myTanks.length; i++) {
		speed = myTanks[i].goal.speed * 1;
		angleVel = myTanks[i].goal.angleVel * 1;
		orders = {
			tankNumbers: [myTanks[i].tankNumber], //an array of numbers e.g. [0,1,2,3]
			speed: speed,                         //speed of tank value of -1 to 1, numbers outside of this range will default to -1 or 1, whichever is closer.
			angleVel: angleVel                    //turning speed of tank positive turns right, negative turns left
		}
		command.emit("move", orders);
	}
}

function fire() {
	var orders = {
		tankNumbers: [0,1,2,3]
	}
	command.emit("fire", orders);
}

function unStick() {
	for (var i = 0; i < myTanks.length; i++) {
		myTanks[i].goal.speed = 1;
	}
}

/** recieve from server **/
socket.on("refresh", function(gameState) {
	//console.log(gameState.boundaries);
	var myTanksNewPosition = gameState.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});
	var enemyTanks = gameState.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});
// console.log(myTanks);
	updateMyTanks(myTanksNewPosition);
	updateEnemyTanks(enemyTanks);
	calculateGoal();
	// if (gameState.boundaries.length > 0) {
	// 	//calculateObstacle(gameState.boundaries);
	// }
	
});

function updateMyTanks (myTanksNewPosition) {
	for (var i = 0; i < myTanks.length; i++) {
		for (var j = 0; j < myTanksNewPosition.length; j++) {
			if (myTanks[i].tankNumber === myTanksNewPosition[j].tankNumber) {
				if(i == 1){console.log(myTanks[i].angle + ":" + myTanksNewPosition[j].angle)};
				if(Math.abs(myTanks[i].position.x - myTanksNewPosition[j].position.x) == 0 && Math.abs(myTanks[i].position.y - myTanksNewPosition[j].position.y) == 0 ) {
					myTanks[i].stuck = !myTanks[i].stuck;
					// setInterval(function() {
					// 	myTanks[i].stuck = false;
					// }, 1000);

				}
				myTanks[i].position = myTanksNewPosition[j].position;
				myTanks[i].angle = myTanksNewPosition[j].angle;
				myTanks[i].hasFlag = myTanksNewPosition[j].hasFlag;
			}
		}
	}
}

function updateEnemyTanks (enemyTanksNewPosition) {
	for (var i = 0; i < enemyTanks.length; i++) {
		for (var j = 0; j < enemyTanksNewPosition.length; j++) {
			if (enemyTanks[i].tankNumber === enemyTanksNewPosition[j].tankNumber) {
				enemyTanks[i].position = enemyTanksNewPosition[j].position;
				enemyTanks[i].angle = enemyTanksNewPosition[j].angle;
				enemyTanks[i].hasFlag = enemyTanksNewPosition[j].hasFlag;
			}
			if(enemyTanks[i].hasFlag) {
				console.log("enemy has a flag");
			}
		}
	}
}

function calculateGoal() {
	var distance = 0;
	var angle = 0;
	var degrees = 0;
	var relativeX = 0;
	var relativeY = 0;

	for (var i = 0; i < myTanks.length; i++) {
		if (myTanks[i].hasTarget()) {
			goal = myTanks[i].getTarget();
		} else {
			goal = myTanks[i].generateTarget();
		}
		//find distance to goal
		distance = round(Math.sqrt(Math.pow(( goal.x - myTanks[i].position.x ), 2) + Math.pow(( goal.y - myTanks[i].position.y ), 2)), 4);

		//find angle difference to face goal
		relativeX = goal.x - myTanks[i].position.x;
		relativeY = goal.y - myTanks[i].position.y;
		angle = round(Math.atan2(-(relativeY), relativeX), 4);
		degrees = round(angle * (180 / Math.PI), 4);  //convert from radians to degrees
		degrees = degrees % 360; //(0 to 360)prevent overflow
		degrees = -(degrees); // tank degrees ascends clockwise. atan2 ascends counter clockwise. this fixes that difference

		//turn in the direction whichever is closer
		if (degrees > myTanks[i].angle) { // +
			myTanks[i].goal.angleVel = 1;
		} else { // -
			myTanks[i].goal.angleVel = -1;	
		} 

		//set speed
		if (distance >= 20) {
			myTanks[i].goal.speed = 1;
		} else {
			myTanks[i].missionAccomplished();
		}
		if(myTanks[i].stuck) {
			myTanks[i].backup();
		}

	}
}

// function calculateObstacle(obstacles) {


// }





/*** TANK ***/
var Tank = function(tankNumber) {
	this.tankNumber = tankNumber;
	this.tankColor = selectedPlayer.playerColor;
	this.position = {x: 0, y: 0};
	this.angle;
	this.goal = {
		speed: 0,
		angleVel: -1
	};
	this.avoidObstacle = {
		speed: 0,
		angleVel: -1
	};
	this.target = {x: 100, y: 100};
	this.hasATarget = false;
	this.stuck = false;
};

Tank.prototype = {
	getTarget: function() {
		var capturedFlags = enemyTanks.filter(function(t) {
			return t.hasFlag == selectedPlayer.playerColor ;
		});
		if(capturedFlags.length) {
			console.log("CapturedFlags: Changing Target");
			console.log(capturedFlags)
			this.target = capturedFlags[0].position;
		}
		return this.target;
	},
	hasTarget: function() {
		return this.hasATarget;
	},
	generateTarget: function() {
		// this.target = this.wander();
		if(this.hasFlag){
			this.target = this.goHome();
		} else {
			this.target = this.attack();
		}
		console.log(enemyTanks);
		var capturedFlags = enemyTanks.filter(function(t) {
			return t.hasFlag == selectedPlayer.playerColor	;
		});
		if(capturedFlags[0]) {
			console.log("CapturedFlags");
			console.log(capturedFlags[0])
			this.target = capturedFlags[0].position;
		}
		for (var j = 0; j < enemyTanks.length; j++) {
			if(enemyTanks[j].hasFlag){
				goal = enemyTanks[j].position;
				continue;
			}
		}
		this.hasATarget = true;
		return this.target;
	},
	missionAccomplished: function() {
		this.hasATarget = false;
	},
	attack: function() {
		return allBases[(playerSelection +1)%allBases.length].base.position;
	},
	goHome: function() {
		return myBase.base.position;
	},
	wander: function() {
		//wander between all bases
		//random num between 0 and enemyBases.length
		var randomNumber = Math.floor(Math.random() * 10 % allBases.length); 
		return allBases[randomNumber].base.position;
	},
	backup: function() {
		this.goal.speed = -1;
		this.goal.angleVel = 0;
		// this.goal.angleVel = (this.goal.angle+90)%360;
		// this.goal.angleVel = (this.goal.angle+90)%360;
		this.stuck = false;
	}
};


//rounds number (value) to specified number of decimals
function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}


