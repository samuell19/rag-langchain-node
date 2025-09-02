import { DataAPIClient } from "@datastax/astra-db-ts";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
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

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  batchSize: 512,
  openAIApiKey: OPENAI_API_KEY
});

const getPdfFiles = (folderPath: string): string[] => {
  if (!fs.existsSync(folderPath)) {
    console.log(`Pasta não encontrada: ${folderPath}`);
    return [];
  }

  return fs.readdirSync(folderPath)
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(folderPath, file));
};

const f1PdfFiles = getPdfFiles("./pdfs");

const client = new DataAPIClient(ASTRA_DB_APLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE! });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100
});

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  const collectionName = ASTRA_DB_COLLECTION || "default_collection";
  const res = await db.createCollection(collectionName, {
    vector: {
      dimension: 1536,
      metric: similarityMetric
    }
  });
  console.log(res);
};

const readPDF = async (filePath: string): Promise<string> => {
  try {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map(doc => doc.pageContent).join("\n");
  } catch (error) {
    console.error(`Erro ao ler o PDF ${filePath}:`, error);
    return "";
  }
};

const loadSampleData = async () => {
  const collectionName = ASTRA_DB_COLLECTION || "default_collection";
  const collection = await db.collection(collectionName);

  for await (const pdfPath of f1PdfFiles) {
    const fileName=path.basename(pdfPath);
    console.log(`Verificando o arquivo: ${fileName}...`);

    const existingDoc= await collection.findOne({
      source:fileName
    })

    if (existingDoc){
      console.log(`Arquivo ${fileName} já foi lido, pulando`);
      continue;
    }

    console.log(`Processando arquivo: ${pdfPath}`);

    if (!fs.existsSync(pdfPath)) {
      console.log(`Arquivo não encontrado: ${pdfPath}`);
      continue;
    }

    const content = await readPDF(pdfPath);
    const chunks = await splitter.splitText(content);

    console.log(`   -> Criando ${chunks.length} vetores...`);
    const vectors = await embeddings.embedDocuments(chunks);

    const documentsToInsert = chunks.map((chunk, i) => ({
      $vector: vectors[i],
      text: chunk,
      source: fileName, 
    }));

    if (documentsToInsert.length > 0) {
        console.log(`   -> Inserindo ${documentsToInsert.length} documentos...`);
        await collection.insertMany(documentsToInsert);
    }
    
    console.log(`   -> Arquivo ${fileName} processado e inserido com sucesso!`);
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
