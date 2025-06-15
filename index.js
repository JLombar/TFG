const { DbUtils, SessionUtils, renderScoreAPL } = require('./utils');
const { checkGameStarted, chooseMinigame } = require('./responses');
const { chainWordGame } = require('games/chainWord.js');
const { mathChainGame } = require ('games/mathChain.js')
const { fizzBuzzGame } = require ('games/fizzBuzz.js')
const { triviaGame } = require ('games/trivia.js')
const { veoVeoGame } = require ('games/veoVeo.js')
const { hangmanGame } = require ('games/hangman.js')
const { detectiveGame } = require ('games/detective.js')
const showBoard = require('./documents/showBoard.json');
const showHangman = require('./documents/showHangman.json');
const showPark = require('./documents/showPark.json');
const showVideo = require('./documents/showVideo.json');
const showScore = require('./documents/showScore.json');
const showVictory = require('./documents/showVictory.json');
const showInit = require('./documents/showInit.json');
const newPlayerResponses = require('./tools/dialogues');

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = "PartyGame";

const GameStartHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest' ||
           (request.type === 'IntentRequest' && request.intent.name === 'GameStartIntent');
  },
  handle(handlerInput) {
    const speechOutput = '¡Vamos a jugar una partida! ¿Cuántos jugadores participarán?';

    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
      handlerInput.responseBuilder
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.1',
        token: 'initBoard',
        document: showInit,
        datasources: {}
      });
    }

    return handlerInput.responseBuilder
      .speak(`
      <speak>
        <audio src="soundbank://soundlibrary/alarms/air_horns/air_horn_01"/>
        ¡Que empiece la fiesta! ¿Cuántos valientes se apuntan a la partida?
      </speak>    
      `)
      .reprompt('Dime, ¿cuántos vais a jugar?')
      .getResponse();
  },
};

const SetPlayersHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado){
      return false;
    }
    return request.type === 'IntentRequest' && request.intent.name === 'SetPlayersIntent';
  },
  
  async handle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;
    let numPlayers = null
    if (request.intent.slots?.numPlayers) {
      numPlayers = parseInt(request.intent.slots.numPlayers.value, 10);
    }
    if (!numPlayers) {
      return handlerInput.responseBuilder
        .speak("No entendí el número de jugadores. Por favor, dime cuántos jugadores hay.")
        .reprompt("Dime cuántos jugadores hay para comenzar.")
        .getResponse();
    }
    
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const dbSaveSuccess = await DbUtils.saveNumPlayers(userId, numPlayers);
    if (!dbSaveSuccess) {
      return handlerInput.responseBuilder
        .speak("Hubo un problema guardando los datos.")
        .getResponse();
    }

    SessionUtils.initializePlayersSession(handlerInput, numPlayers);
    sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    return handlerInput.responseBuilder
      .speak(`Muy bien valientes, ahora necesito que tiréis un dado y me digáis vuestro nombre y lo que habéis sacado.`)
      .reprompt('Recuerda decirme tu nombre y el número que has sacado en el dado.')
      .getResponse();
  },
};

const SetPlayerNameHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado){
      return false;
    }
    return request.type === 'IntentRequest' && request.intent.name === 'SetPlayerNameIntent';
  },

  async handle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;
    const playerName = request.intent.slots?.playerName?.value || null;
    if (!playerName) {
      return handlerInput.responseBuilder
        .speak("No entendí el nombre del jugador. Por favor, repitelo.")
        .reprompt("Por favor, dime otra vez el nombre del jugador.")
        .getResponse();
    }
    const playerOrder = request.intent.slots?.playerOrder?.value || null;
    if (!playerOrder || playerOrder<1 || playerOrder>6) {
      return handlerInput.responseBuilder
        .speak("No entendí el resultado del dado. Por favor, repítelo. Ten en cuenta que debe ser un número entre 1 y 6.")
        .reprompt("Por favor, dime otra vez el resultado del dado.")
        .getResponse();
    } 

    const sessionAttributes = SessionUtils.addPlayerData(handlerInput, playerName, playerOrder);
    
    if (sessionAttributes.nombresJugadores.length >= sessionAttributes.numPlayers) {
      const userId = handlerInput.requestEnvelope.session.user.userId;
      const dbSaveSuccess = await DbUtils.savePlayerData(userId, sessionAttributes.nombresJugadores, sessionAttributes.ordenJugadores);
      
      if (!dbSaveSuccess) {
        return handlerInput.responseBuilder
          .speak("Hubo un problema guardando los nombres de los jugadores.")
          .getResponse();
      }
      
      const jugadores = await DbUtils.getPlayersInOrder(userId);
      sessionAttributes.originalPlayers = jugadores;
      speechOutput = "¡Perfecto! El orden a la hora de realizar los minijuegos es: "
      for (let i = 0; i < jugadores.length-1; i++) {
        speechOutput += `${jugadores[i].name}, `
      }
      if (jugadores.length!=2) {
        speechOutput += `y por último ${jugadores[jugadores.length-1].name}. ¡Comienza la partida! `
      } else {
        speechOutput += `y después ${jugadores[jugadores.length-1].name}. ¡Comienza la partida! `
      }

      let minigameIntro = await chooseMinigame(sessionAttributes, handlerInput);
      minigameIntro += `<break time="1s"/> ¡${jugadores[0].name}, empiezas tú! `

      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return handlerInput.responseBuilder
        .speak(`
        <speak>
          ${speechOutput}
          <audio src="soundbank://soundlibrary/sports/whistles/sports_whistles_02"/>
          ${minigameIntro}
        </speak>
        `)
        .reprompt(minigameIntro)
        .getResponse();
    }

    const nextPlayerNumber = sessionAttributes.nombresJugadores.length + 1;
    
    const randomResponse = newPlayerResponses[Math.floor(Math.random() * newPlayerResponses.length)];
    
    console.log(randomResponse);
    return handlerInput.responseBuilder
      .speak(randomResponse)
      .reprompt('Recuerda decirme tu nombre y el número que has sacado con el dado.')
      .getResponse();
  },
};

const ScoreUpdateHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'ScoreUpdateIntent';
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const { request } = handlerInput.requestEnvelope;
    const slots = request.intent.slots?.slots?.value;
    const puntos = parseInt(slots, 10);
    if (!puntos || puntos > 6 || puntos < 1) {
      return handlerInput.responseBuilder
        .speak("No entendí los puntos. Por favor, repitelo. Recuerda que debe ser un número del dado")
        .reprompt("Por favor, dime otra vez los puntos.")
        .getResponse();
    }
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    const winner = { ...sessionAttributes.winner };
    const newScore = winner.score + puntos;
    await DbUtils.updatePlayerScore(userId, winner.name, newScore);
    const jugadores = await DbUtils.getPlayersInOrder(userId);
    console.log(jugadores);
    sessionAttributes.originalPlayers = jugadores;
  
    if (newScore >= 10) {
      handlerInput.responseBuilder.addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.1',
        token: 'victoryBoard',
        document: showVictory,
        datasources: {
          victoryData: {
            name: winner.name,
          }
        }
      });

      return handlerInput.responseBuilder
        .speak(`
        <speak>
          <audio src="soundbank://soundlibrary/musical/amzn_sfx_trumpet_bugle_03"/>
           ¡Felicidades ${winner.name}! Has alcanzado 10 puntos y has ganado el juego.
        </speak>
        `)
        .getResponse();
    }

    let speakOutput = `¡Enhorabuena ${winner.name}! Has ganado ${slots} puntos`;
    let newPosition = `Mueve la ficha en el tablero hasta la casilla ${newScore}. Ahora voy a buscar un nuevo juego.`;

    let minigameIntro = await chooseMinigame(sessionAttributes, handlerInput);

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    return handlerInput.responseBuilder
    .speak(`
    <speak>
      ${speakOutput}
      <audio src="soundbank://soundlibrary/alarms/chimes_and_bells/chimes_bells_04"/>
      ${newPosition}
      <audio src="soundbank://soundlibrary/toys_games/board_games/board_games_01"/>
      ${minigameIntro}!
    </speak>
    `)
    .reprompt(minigameIntro)
    .getResponse();
  }
};

const WordChainHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===0){
      return request.type === 'IntentRequest' && request.intent.name === 'WordChainIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)

    return await chainWordGame(handlerInput);
  }
};

const MathChainHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===1){
      return request.type === 'IntentRequest' && request.intent.name === 'MathChainIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)
    
    return await mathChainGame(handlerInput);
  }
};

const FizzBuzzHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===2){
      return request.type === 'IntentRequest' && request.intent.name === 'FizzBuzzIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)
    
    return await fizzBuzzGame(handlerInput);
  }
};

const TrivialHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===3){
      return request.type === 'IntentRequest' && request.intent.name === 'TrivialIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)
    
    return await triviaGame(handlerInput);
  }
};

const VeoVeoHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===4){
      return request.type === 'IntentRequest' && request.intent.name === 'VeoVeoIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)

    return await veoVeoGame(handlerInput);
  }
};

const DetectiveHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===6){
      return request.type === 'IntentRequest' && request.intent.name === 'DetectiveIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const numPlayers = await DbUtils.getNumPlayers(userId);
    checkGameStarted(numPlayers, handlerInput)

    return await detectiveGame(handlerInput);
  }
};

const HangmanHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttributes.juegoIniciado && sessionAttributes.juegoSeleccionado===5){
      return request.type === 'IntentRequest' && request.intent.name === 'HangmanIntent';
    } else{
      return false;
    }
  },

  async handle(handlerInput) {
  const sess = handlerInput.attributesManager.getSessionAttributes();
  const SECRET_WORD = "murcielago";

  if (!sess.hangman) {
    sess.hangman = {
      word: SECRET_WORD,
      guessedLetters: [],
      wrongCount: 0
    };
    sess.activePlayers = [...sess.originalPlayers];
    sess.turnoActual = 0;

    const wordProgress = SECRET_WORD.split('').map(() => '_').join(' ');
    const wrongCount = 0;
    const usedLetters = '—';
    
    console.log("Progreso de palabra inicial:", wordProgress);
    
    handlerInput.responseBuilder.addDirective({
      type: 'Alexa.Presentation.APL.RenderDocument',
      version: '1.1',
      token: 'hangmanBoard',
      document: showHangman,
      datasources: {
        hangmanData: {
          wordProgress: wordProgress,
          wrongCount: wrongCount,
          usedLetters: usedLetters,
          currentImage: `https://jlombar.github.io/PartyGameImages/hangman_0_error.png`
        }
      }
    });
  }

    return await hangmanGame(handlerInput);
  }
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Puedes pedirme cuántos jugadores hay, pedirme la puntuación o salir del juego.')
      .reprompt('Dime cuántos jugadores hay o di salir para cerrar la skill.')
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' &&
      (request.intent.name === 'AMAZON.CancelIntent' || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('¡Adiós!')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  async handle(handlerInput) {
    try {
        const scanResult = await dynamodb.scan({
            TableName: TABLE_NAME
        }).promise();
        
        console.log('Items encontrados:', scanResult.Items.length);
        
        for (const item of scanResult.Items) {
            console.log('Borrando item:', item.id);
        //    await dynamodb.delete({
        //        TableName: TABLE_NAME,
        //        Key: { id: item.id }
        //    }).promise();
        }
        
        console.log('Todos los items borrados');
    } catch (error) {
        console.error('Error:', error);
    }

    return handlerInput.responseBuilder.getResponse();
  },
};


const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error: ${error.message}`);
    return handlerInput.responseBuilder
      .speak('Lo siento, ocurrió un error.')
      .reprompt('Ocurrió un error. Inténtalo de nuevo.')
      .getResponse();
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    WordChainHandler,
    MathChainHandler,
    FizzBuzzHandler,
    GameStartHandler,
    TrivialHandler,
    VeoVeoHandler,
    HangmanHandler,
    DetectiveHandler,
    SetPlayersHandler,
    SetPlayerNameHandler,
    ScoreUpdateHandler,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
