import React, { useState, useRef } from "react";
import { FileText, Upload, Download, Lock, Eye, EyeOff } from "lucide-react";
import CryptoJS from "crypto-js";
import QRCode from "qrcode";
import JSZip from "jszip";

interface QRCodeData {
  url: string;
  qrDataUrl: string;
  number: string;
}

function App() {
  const [error, setError] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileContent, setFileContent] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const BATCH_SIZE = 2000;
  const BATCH_DELAY = 10000; // 10 seconds in milliseconds

  const generateHash = (number: string, password: string) => {
    const combinedString = number + password;
    return CryptoJS.SHA256(combinedString).toString();
  };

  const generateQRCode = async (url: string): Promise<string> => {
    return await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Validate all lines first
      for (const line of lines) {
        const number = line.replace(/\s/g, "");
        if (!/^\d+$/.test(number)) {
          throw new Error(`Linha contém caracteres inválidos: "${line}"`);
        }
      }

      setFileContent(lines);
      setDebugInfo(
        `Arquivo carregado com ${lines.length} linha(s). Digite a senha para gerar os QR codes.`
      );
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao processar arquivo"
      );
      setFileContent([]);
    }
  };

  const processBatch = async (
    startIndex: number,
    endIndex: number,
    password: string
  ): Promise<QRCodeData[]> => {
    const batchQRCodes: QRCodeData[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const number = fileContent[i].replace(/\s/g, "");
      const hash = generateHash(number, password);
      const url = `https://check.vant.plus/${number}-${hash}`;
      const qrDataUrl = await generateQRCode(url);

      batchQRCodes.push({
        url,
        qrDataUrl,
        number,
      });
    }

    return batchQRCodes;
  };

  const downloadBatch = async (
    qrCodes: QRCodeData[],
    batchNumber: number,
    start: number,
    end: number
  ) => {
    const zip = new JSZip();
    const folderName = `QR Codes ${start} - ${end}`;
    const folder = zip.folder(folderName);

    if (!folder) {
      throw new Error("Erro ao criar pasta ZIP");
    }

    // Ordenar os QR codes pelo número antes de adicionar ao ZIP
    const sortedQRCodes = qrCodes.sort(
      (a, b) => parseInt(a.number) - parseInt(b.number)
    );

    sortedQRCodes.forEach((qrCode) => {
      const base64Data = qrCode.qrDataUrl.replace(
        /^data:image\/png;base64,/,
        ""
      );
      folder.file(`qrcode_${qrCode.number}.png`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const generateAndDownloadQRCodes = async () => {
    if (!password) {
      setError("Por favor, digite uma senha para gerar os QR codes");
      return;
    }

    if (fileContent.length === 0) {
      setError("Por favor, carregue um arquivo primeiro");
      return;
    }

    try {
      setIsProcessing(true);
      setError("");

      const totalItems = fileContent.length;
      const totalBatches = Math.ceil(totalItems / BATCH_SIZE);

      for (let batchNumber = 0; batchNumber < totalBatches; batchNumber++) {
        const startIndex = batchNumber * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, totalItems);
        const displayStart = startIndex + 1;
        const displayEnd = endIndex;

        setCurrentBatch({ start: displayStart, end: displayEnd });
        setDebugInfo(
          `Processando lote ${
            batchNumber + 1
          }/${totalBatches}: códigos ${displayStart} até ${displayEnd}`
        );

        const batchQRCodes = await processBatch(startIndex, endIndex, password);

        setDebugInfo(
          `Baixando lote ${
            batchNumber + 1
          }/${totalBatches}: códigos ${displayStart} até ${displayEnd}`
        );
        await downloadBatch(
          batchQRCodes,
          batchNumber + 1,
          displayStart,
          displayEnd
        );

        if (batchNumber < totalBatches - 1) {
          setDebugInfo(
            `Lote ${
              batchNumber + 1
            } concluído. Aguardando 10 segundos antes do próximo lote...`
          );
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }

      setDebugInfo(
        `Processamento concluído. Todos os ${totalItems} QR codes foram gerados e baixados em ${totalBatches} lotes.`
      );
      setCurrentBatch(null);
    } catch (err) {
      setError("Erro ao gerar ou baixar QR codes");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center mb-8">
            <FileText className="w-12 h-12 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800 ml-4">
              Gerador de QR Codes
            </h1>
          </div>

          <div className="space-y-6">
            {/* File Upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 transition-colors"
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Clique ou arraste seu arquivo de texto aqui
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Cada linha do arquivo deve conter apenas números
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Senha para geração do hash
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 pl-10 pr-10 py-2"
                  placeholder="Digite a senha"
                />
                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Generate Button */}
            {fileContent.length > 0 && (
              <button
                onClick={generateAndDownloadQRCodes}
                disabled={isProcessing}
                className={`w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-md transition-colors ${
                  isProcessing
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-indigo-700"
                }`}
              >
                {isProcessing ? "Processando..." : "Gerar e Baixar QR Codes"}
              </button>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg">
                <p className="font-medium">Erro:</p>
                <p>{error}</p>
              </div>
            )}

            {(debugInfo || currentBatch) && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-700 mb-2">Informações:</p>
                <pre className="whitespace-pre-wrap text-sm text-gray-600 font-mono">
                  {debugInfo}
                  {currentBatch &&
                    `\nProcessando códigos ${currentBatch.start} até ${currentBatch.end}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
