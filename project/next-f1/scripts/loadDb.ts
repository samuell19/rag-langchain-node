import { DataAPIClient } from "@datastax/astra-db-ts";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { OpenAI } from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const {
  OPENAI_API_KEY,
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APLICATION_TOKEN
} = process.env;

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Array com os caminhos dos arquivos PDF
const f1PdfFiles = [
  "./pdfs/formula1_rules.pdf",
  "./pdfs/f1_history.pdf",
  "./pdfs/f1_teams_2024.pdf",
  "./pdfs/f1_regulations.pdf"
  // Adicione mais arquivos PDF conforme necessário
];

const client = new DataAPIClient(ASTRA_DB_APLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100
});

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  const res = await db.createCollection(ASTRA_DB_COLLECTION, {
    vector: {
      dimension: 1536,
      metric: similarityMetric
    }
  });
  console.log(res);
};

const loadSampleData = async () => {
  const collection = await db.collection(ASTRA_DB_COLLECTION);
  
  for await (const pdfPath of f1PdfFiles) {
    console.log(`Processando arquivo: ${pdfPath}`);
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(pdfPath)) {
      console.log(`Arquivo não encontrado: ${pdfPath}`);
      continue;
    }

    const content = await readPDF(pdfPath);
    const chunks = await splitter.splitText(content);
    
    for await (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
        encoding_format: "float"
      });

      const vector = embedding.data[0].embedding;
      const res = await collection.insertOne({
        $vector: vector,
        text: chunk,
        source: path.basename(pdfPath) // Adiciona o nome do arquivo como fonte
      });
      console.log(`Chunk inserido do arquivo: ${path.basename(pdfPath)}`);
    }
  }
};

const readPDF = async (filePath: string): Promise<string> => {
  try {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    
    // Combina o conteúdo de todas as páginas
    return docs.map(doc => doc.pageContent).join("\n");
  } catch (error) {
    console.error(`Erro ao ler o PDF ${filePath}:`, error);
    return "";
  }
};

const init = async () => {
  try {
    await createCollection();
    console.log("Coleção criada com sucesso!");
  } catch (err: any) {
    if (err.name === "CollectionAlreadyExistsError") {
      console.log("Coleção já existe, continuando...");
    } else {
      throw err;
    }
  }
  
  await loadSampleData();
  console.log("Processamento concluído!");
};

init();