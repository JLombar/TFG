const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const showMathChain = require('../documents/showMathChain.json');

function startMathChainGame(sessionAttributes, handlerInput) {
    const initialCalc = generateInitialCalculation();
    sessionAttributes.currentResult = initialCalc.result;
    sessionAttributes.currentCalculationText = initialCalc.text;
    
    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
      handlerInput.responseBuilder.addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.6',
        token: 'mathChainBoard',
        document: showMathChain,
        datasources: {
          mathChainData: {
            operation: initialCalc.operation,
          }
        }
      });
    }

    return ` ${initialCalc.text} `;
}

function generateInitialCalculation() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const result = a + b;
    const text = `Comienza la cadena: ¿Cuánto es ${a} más ${b}?`;
    const operation = `${a} + ${b}`;
    console.log('generateInitialCalculation - valores:', { a, b, result });
    return { text, result, operation };
}

module.exports = { startMathChainGame };