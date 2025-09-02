import OpenAI from "openai"
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DataAPIClient } from "@datastax/astra-db-ts";

const { OPENAI_API_KEY, ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APLICATION_TOKEN } = process.env;

const openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });

const client = new DataAPIClient(ASTRA_DB_APLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE })

export async function POST(req: Request) {
    try {
        console.log("API route called");
        const { messages } = await req.json()
        console.log("Messages received:", messages);
        const latestMessage = messages[messages?.length - 1]?.content
        console.log("Latest message:", latestMessage);
        let docContext = ""

        console.log("Creating embedding...");
        const embedding = await openaiClient.embeddings.create({
            model: "text-embedding-3-small",
            input: latestMessage,
            encoding_format: "float"
        })
        console.log("Embedding created successfully");
        
        try {
            console.log("Querying database...");
            const collection = await db.collection(ASTRA_DB_COLLECTION)
            const cursor = collection.find(null, {
                sort: {
                    $vector: embedding.data[0].embedding,
                },
                limit: 10
            })
            const documents = await cursor.toArray()
            console.log("Documents found:", documents.length);
            const docsMap = documents?.map(doc => doc.text)
            docContext = JSON.stringify(docsMap)
            console.log("Document context length:", docContext.length);
        } catch (err) {
            console.log("error querying db:", err)
            docContext = ""
        }

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