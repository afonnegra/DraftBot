import * as OpenAI from 'openai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit , doc, and } from 'firebase/firestore/lite';
const config = useRuntimeConfig();

const openai = new OpenAI.OpenAI({ apiKey: config.OPENAI });

const firebaseConfig = {
    apiKey: config.APIKEY,
    projectId: config.PROJECTID,
    messagingSenderId: config.MSI,
    appId: config.APPID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runConversation(phone:string, message:string) {
    const messages:Array<any> = [
        { role: 'system', content: 'Tu eres un asistente que listará y describirá sobre noticias de colombia y el mundo' },
        { role: 'system', content: 'No debes hablar sobre otros temas que no sean noticias. En caso de que el usuario te escriba algo fuera de alguna noticia, debes responder "Bienvenido a Colombia Al Día, por favor has tu consulta sobre que quieres saber en Colombia, el mundo, en deportes o el entretenimiento!. Puedes hacer solicitudes como "que ha pasado con el presidente hoy?" o "cuales son las noticias de política"."' },
        { role: 'system', content: 'Si te preguntan sobre una noticia especificamente debes describirla en detalle' },
        { role: 'system', content: 'Si te preguntan sobre una categoría de noticias debes solo listarlas y describirlas brevemente.' },
        { role: 'system', content: `El día de hoy es ${getDate()}` },
        { role: 'assistant', content: 'De acuerdo' },
        { role: "user", content: message },
    ];

    const tools:Array<any> = [
        {
            type: "function",
            function: {
                name: "get_news",
                description: "trae un listado de noticias basado en alguna categoría",
                parameters: {
                    type: "object",
                    properties: {
                        data: {
                            type: "string",
                            enum: ['politica','deportes','mundo','entretenimiento','todas'],
                            description: "las categorías sobre las cuales el usuario puede buscar noticias",
                        },
                        date: {
                            type: "string",
                            description: "la fecha sobre la cual el usuario puede filtrar. El formato es MM-DD-AAAA"
                        }
                    },
                    required: ["category", "date"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_specific_news",
                description: "trae una sola noticia basado en algun dato especifico",
                parameters: {
                    type: "object",
                    properties: {
                        data: {
                            type: "string",
                            description: "Son las palabras clave 'keywords' separadas por coma. ejemplo: presidente, viaje, españa",
                        },
                        date: {
                            type: "string",
                            description: "la fecha sobre la cual el usuario puede filtrar. El formato es MM-DD-AAAA"
                        }
                    },
                    required: ["content", "date"],
                },
            },
        },
    ];

    const response:any = await openai.chat.completions.create({
        model: "gpt-4-32k",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    console.log(responseMessage)

    const toolCalls = responseMessage.tool_calls;
    if (responseMessage.tool_calls) {

        const availableFunctions:any = {
            get_news: getNews,
            get_specific_news: getSpecificNews
        };

        messages.push(responseMessage); // extend conversation with assistant's reply
        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall:any = availableFunctions[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const functionResponse = await functionToCall(
                functionArgs.data,
                functionArgs.date
            );
            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: functionResponse,
            }); // extend conversation with function response
        }
        console.log(messages);
        const secondResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: messages,
        }); // get a new response from the model where it can see the function response
        const response = secondResponse.choices;
        sendWhatsAppMessage(parseInt(phone),response[0].message.content);
    }

}

async function getNews(category:string, date:string)  {
    console.log(category, date);
    let setQuery; 
    if(category == 'todas') {
        setQuery = query(collection(db, `news/`), where("date", "==", date), limit(5) );
    } else {
        setQuery = query(collection(db, `news/`), and( where("category", "==", category), where("date", "==", date)), limit(5) );
    }

    const getNews = await getDocs(setQuery);
    const result:Array<any> = [];
    getNews.forEach((doc) => {
        result.push({ id: doc.id, news: doc.data()})     
    });
    console.log(result)
    return JSON.stringify(result);
}

async function getSpecificNews(data:string, date:string)  {
    let list; 
    if(data.indexOf(',')>-1) {
        list = data.split(",");
    } else {
        list = [data]
    }
    console.log(list)
    let setQuery = query(collection(db, `news/`), and( where("keywords", "array-contains-any", list), where("date", "==", date)), limit(5) );
    const getNews = await getDocs(setQuery);
    const result:Array<any> = [];
    getNews.forEach((doc) => {
        result.push({ id: doc.id, news: doc.data()})     
    });
    return JSON.stringify(result);
}

function getDate() {
    const d = new Date();
    return `${d.getMonth()+1}-${d.getDate()}-${d.getFullYear()} en formato MM-DD-AAAA`
}


async function sendWhatsAppMessage(recipient:number, message:any) {
    const url = `https://graph.facebook.com/v17.0/111947191855209/messages`;
    const body = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: {
            body: message
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.FB}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        
        const data = await response.json();
        console.log('Message sent successfully:', data);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}


export default defineEventHandler(async (event) => {
    const body:any = await readBody(event);
    console.log(body);
    try {
        console.log('entro')
        if(body.entry.length>0) {
            const phone = body.entry[0].changes[0].value.messages.from;
            const msgType = body.entry[0].changes[0].value.messages[0].type;
            let message;
            if(msgType == 'text') {
                console.log('entro2')
                
                message = body.entry[0].changes[0].value.messages[0].text.body;
                console.log(message);
                runConversation(phone, message)
            } else {
                sendWhatsAppMessage(parseInt(phone),'Lo Lamento solo recibo texto');
            }   
        }

    } catch (e:any) {
        console.log(e);
    };
    return
});
