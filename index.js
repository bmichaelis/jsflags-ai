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
	playerSelection = parseInt(process.argv[2], 10);
}

var enemyBases = [];
var myTanks = [];
var allBases = [];
//Create a variable to store my base object
var myBase = {};
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
	// Filter the players object and return only an array of my base
	// Assign the first element [0] to the myBase variable;
	myBase = initData.players.filter(function(p) {
		return selectedPlayer.playerColor == p.playerColor;
	})[0].base;
	console.log(myBase);
	allBases = initData.players;
	var serverTanks = initData.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});
	for (var i = 0; i < serverTanks.length; i++) {
		myTanks.push(new Tank(i));
	}

	setTimeout(function() {
		startInterval();
	}, 2000);

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

/** recieve from server **/
socket.on("refresh", function(gameState) {
	var myTanksNewPosition = gameState.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});

	updateMyTanks(myTanksNewPosition);
	calculateGoal();
	// if (gameState.boundaries.length > 0) {
	// 	//calculateObstacle(gameState.boundaries);
	// }
	
});

function updateMyTanks (myTanksNewPosition) {
	for (var i = 0; i < myTanks.length; i++) {
		for (var j = 0; j < myTanksNewPosition.length; j++) {
			if (myTanks[i].tankNumber === myTanksNewPosition[j].tankNumber) {
				myTanks[i].position = myTanksNewPosition[j].position;
				myTanks[i].angle = myTanksNewPosition[j].angle;
				myTanks[i].hasFlag = myTanksNewPosition[j].hasFlag;
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
			//myTanks[i].goal.speed = 0;
			myTanks[i].missionAccomplished();
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
		angleVel: 0
	};
	this.avoidObstacle = {
		speed: 0,
		angleVel: 0
	};
	this.target = {x: 100, y: 100};
	this.hasATarget = false;
};

Tank.prototype = {
	getTarget: function() {
		return this.target;
	},
	hasTarget: function() {
		return this.hasATarget;
	},
	generateTarget: function() {

		if(this.hasFlag){
			this.returnHome();
		} else {
			this.attack();
		}

		this.hasATarget = true;
		return this.target;
	},
	missionAccomplished: function() {
		this.hasATarget = false;
	},
	returnHome: function() {
		this.target = myBase.position;
	},
	wander: function() {
		//wander between all bases
		var randomNumber = Math.floor(Math.random() * 10 % allBases.length); //random num between 0 and enemyBases.length
		this.target = allBases[randomNumber].base.position;
	},
	attack: function() {
		var closestBase = {};
		var baseDistance, distance = 0;
		//attach nearest base
		for(var i = 0; i < enemyBases.length; i++){
			distance = round(Math.sqrt(Math.pow(( enemyBases[i].base.position.x - this.position.x ), 2) + Math.pow(( enemyBases[i].base.position.y - this.position.y ), 2)), 4);
			if(!baseDistance || baseDistance > distance){
				baseDistance = distance;
				closestBase = enemyBases[i];
			}
		}
		var randomNumber = Math.floor(Math.random() * 10 % allBases.length); //random num between 0 and enemyBases.length
		this.target = closestBase.base.position;
	}
};


//rounds number (value) to specified number of decimals
function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}


