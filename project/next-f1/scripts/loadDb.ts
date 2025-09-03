import { DataAPIClient } from "@datastax/astra-db-ts";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

//passo as chaves do astra e da openai
const {
  OPENAI_API_KEY,
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APLICATION_TOKEN
} = process.env;

//como o banco vai comparar os vetores 
type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

//crio os embeddings da openai
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  batchSize: 512,
  openAIApiKey: OPENAI_API_KEY
});

//faço um get para a pasta com os PDFs e verifico se existe a pasta
const getPdfFiles = (folderPath: string): string[] => {
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  
  //vou pegar os arquivos pdf da pasta e filtrar pra ler so os com .pdf usando o lower case pra filtrar aqueles que terminam com pdf minusculo
  return fs.readdirSync(folderPath)
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(folderPath, file));
};

//variavel que contem o caminho de todos os PDFs
const f1PdfFiles = getPdfFiles("./pdfs");

//cliente do astra db e passando o endpoint e namespace
const client = new DataAPIClient(ASTRA_DB_APLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE! });

//splitter pra dividir em chunks 
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100
});

//criar as collections no banco de dados
const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  const collectionName = ASTRA_DB_COLLECTION;
  const res = await db.createCollection(collectionName, {
    vector: {
      dimension: 1536,
      metric: similarityMetric
    }
  });
  console.log(res);
};

//lendo o pdf com pdf loader, criando um array docs
const readPDF = async (filePath: string): Promise<string> => {
  try {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map(doc => doc.pageContent).join("\n");
  } catch (error) {
    return "";
  }
};

//vou carregar os dados
const loadSampleData = async () => {
  const collectionName = ASTRA_DB_COLLECTION;
  const collection = db.collection(collectionName);

  //for para percorrer o caminho de pdfs
  for await (const pdfPath of f1PdfFiles) {
    const fileName=path.basename(pdfPath);
    console.log(`verificando o arquivo: ${fileName}`);
    //verificando se o documento já existe
    const existingDoc= await collection.findOne({
      source:fileName
    })
    //se existir, vai pular
    if (existingDoc){
      console.log(`arquivo ${fileName} já lido`);
      continue;
    }

    console.log(`processando arquivo: ${pdfPath}`);
    //verifica se existe
    if (!fs.existsSync(pdfPath)) {
      continue;
    }
    //pega o texto e vai quebrar usando o splitter
    const content = await readPDF(pdfPath);
    const chunks = await splitter.splitText(content);
    //vou passar os embeddings da openai nos chunks para transformar em vetores
    console.log(`   -> Criando ${chunks.length} vetores...`);
    const vectors = await embeddings.embedDocuments(chunks);
    //mapeando os chunks e criando um array de documentos para inserir no banco
    const documentsToInsert = chunks.map((chunk, i) => ({
      $vector: vectors[i],
      text: chunk,
      source: fileName, 
    }));
    //inserindo os documentos no banco y=usando insert many pra vir varios de uma vez
    if (documentsToInsert.length > 0) {
        console.log(`   -> Inserindo ${documentsToInsert.length} documentos...`);
        await collection.insertMany(documentsToInsert);
    }
    
    console.log(`Arquivo ${fileName} processado`);
    }
  };


//init pra startar o script, vou criar a coleção, se ja existir vou pular e continuar
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
