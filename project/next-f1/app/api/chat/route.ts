import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DataAPIClient } from "@datastax/astra-db-ts";
import { OpenAIEmbeddings } from "@langchain/openai";

//vou passar as chaves da openai e do astra
const { ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APLICATION_TOKEN, OPENAI_API_KEY } = process.env;


//vou conectar ao banco 

const embedding= new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    batchSize: 32,
    openAIApiKey: OPENAI_API_KEY
})
const client = new DataAPIClient(ASTRA_DB_APLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE })

//faço uma requisição post para mandar mensagens, criando um array e sempre mostrando a última mensagem
export async function POST(req: Request) {
    try {
        console.log("api chamada");
        const { messages } = await req.json()
        console.log("Mensagens recebidas:", messages);
        const latestMessage = messages[messages?.length - 1]?.content
        console.log("Última mensagem:", latestMessage);
        let docContext = ""

        //cria um embedding para a última mensagem
        console.log("Criando embedding...");
        const vector= await embedding.embedQuery(latestMessage)
        console.log("Embeddings criados");
        
        //vai procurar no db 10 documentos semelhantes ao contexto da mensagem
        try {
            console.log("chamando o banco");
            const collection = db.collection(ASTRA_DB_COLLECTION)
            const cursor = collection.find(null, {
                sort: {
                    $vector: vector,
                },
                limit: 10
            })
            //transforma todos os resultados da memoria em array
            const documents = await cursor.toArray()
            console.log("Documentos encontrados:", documents.length);
            //vai pegar os chunks do documento
            const docsMap = documents?.map(doc => doc.text)
            //vai transformar em uma string json
            docContext = JSON.stringify(docsMap)
            console.log("Tamanho do contexto:", docContext.length);
        } catch (err) {
            console.log("error chamando o banco:", err)
            docContext = ""
        }
        //prompt do sistema: pega o contexto passado e usa para responder os usuários 
        const systemPrompt = `Você é um bibliotecário com livros como base de conhecimento. Use as seguintes informações do contexto para responder às perguntas:
        
        Contexto: ${docContext}
        
        Responda de forma clara e informativa sobre o livro e o que foi perguntado.`

        console.log("Calling streamText...");
        const result = await streamText({
            model: openai('gpt-4o-mini'),
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
        });

        console.log("StreamText completed, returning response");
        return result.toTextStreamResponse();

    } catch (error) {
        console.error('Error:', error);
        return new Response('Error processing request', { status: 500 });
    }
}