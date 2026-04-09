# KGeN Data Collector App — PRD
**Versão do documento:** 1.0  
**Data:** Abril 2026  
**Status:** Em desenvolvimento

---

## 1. Visão Geral do Produto

O **KGeN Data Collector App** é um aplicativo mobile (iOS, Android e Web) para coleta de vídeos estruturados. Usuários completam "Quests" — tarefas de gravação com instruções específicas — e os vídeos passam por um pipeline de QC (Quality Control) local antes de serem enviados para a nuvem via S3.

O diferencial central é que toda a análise de qualidade acontece **no dispositivo**, sem depender do servidor, usando modelos de IA (MediaPipe) para validar presença de mãos, ausência de rosto, luminosidade, nitidez e estabilidade antes do upload.

---

## 2. Stack Técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React Native + Expo (SDK 54), expo-router |
| Backend | Node.js + Express + TypeScript (tsx) |
| Banco de dados | PostgreSQL + Drizzle ORM |
| Storage | AWS S3 (Multipart Upload via pre-signed URLs) |
| AI/ML | MediaPipe WASM (HandLandmarker + FaceLandmarker) v0.10.32 |
| State | React Query (server state) + Context API (local state) |
| Fontes | Inter (Google Fonts via @expo-google-fonts/inter) |
| Ícones | @expo/vector-icons (Ionicons) |

---

## 3. Estrutura de Arquivos

```
app/
  (auth)/
    login.tsx              # Tela de login
    register.tsx           # Tela de cadastro
  (tabs)/
    _layout.tsx            # Layout das tabs
    index.tsx              # Aba Quests (home)
    uploads.tsx            # Aba fila de uploads
    recordings.tsx         # Aba biblioteca local
    account.tsx            # Aba perfil/logout
  quest/
    [id].tsx               # Detalhe do quest
  record/
    [questId].tsx          # Gravação de vídeo + live guidance
  review.tsx               # Análise QC pós-gravação
  test-qc.tsx              # (DEV ONLY) teste manual do pipeline

components/
  ErrorBoundary.tsx        # Captura erros de render
  ErrorFallback.tsx        # UI do crash com botão restart
  KeyboardAwareScrollViewCompat.tsx

lib/
  auth-context.tsx         # Sessão, JWT, login/logout
  recordings-context.tsx   # Fila de uploads e relatórios QC
  query-client.ts          # React Query + getApiUrl()
  qc-engine.ts             # Motor de scoring QC
  qc-types.ts              # Tipos e thresholds padrão
  mediapipe-analyzer.ts    # Análise de frames com MediaPipe
  upload-service.ts        # Upload chunked S3 (Multipart)
  orientation-service.ts   # Sensor de orientação do dispositivo
  types.ts                 # Tipos globais (Recording, Quest, etc.)

server/
  index.ts                 # Entry point do servidor
  routes.ts                # Todas as rotas Express
  s3-multipart.ts          # Serviço AWS SDK S3
  storage.ts               # Camada de acesso ao DB
  db.ts                    # Configuração Drizzle + PostgreSQL

constants/
  colors.ts                # Design tokens (cores)
  
hooks/
  useColors.ts             # Hook para acessar cores via tema
```

---

## 4. Autenticação

### Implementado
- Registro de usuário com username + password (bcrypt)
- Login com JWT — token armazenado em `SecureStore` (nativo) ou `AsyncStorage` (web)
- Logout que deleta o token local e chama `/api/auth/logout`
- `AuthContext` expõe `user`, `token`, `login()`, `logout()`, `isLoading`
- Proteção de rotas: não autenticado é redirecionado para `/login`
- Sessões em memória no servidor (Map<token, userId>)

### Rotas de Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cria usuário (username + password) |
| POST | `/api/auth/login` | Retorna JWT |
| GET | `/api/auth/me` | Retorna dados do usuário autenticado |
| POST | `/api/auth/logout` | Invalida sessão no servidor |

---

## 5. Quests

### Implementado
- 4 quests fixos no servidor (hardcoded em `server/routes.ts`):
  - **Morning Routine Capture** (easy, 50pts, 5–15 min)
  - **Kitchen Cooking Session** (medium, 100pts, 15–30 min)
  - **Outdoor Walking Path** (medium, 75pts, 10–20 min)
  - **Workspace Setup Review** (easy, 40pts, 3–8 min)
- Tela de listagem com cards mostrando título, categoria, dificuldade, duração e recompensa
- Tela de detalhe com instruções passo a passo e botão "Start Quest"

### Rotas de Quests
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/quests` | Lista todos os quests |
| GET | `/api/quests/:id` | Retorna detalhe de um quest |

---

## 6. Gravação de Vídeo

### Implementado

#### 6.1 Orientation Gate
- Antes de iniciar gravação, o app verifica a orientação do dispositivo via `expo-sensors` (acelerômetro)
- A orientação requerida é **landscape** (configurável em `DEFAULT_QC_THRESHOLDS.requiredOrientation`)
- Se o dispositivo não estiver na orientação correta, exibe um overlay bloqueando o início da gravação

#### 6.2 Camera UI
- Usa `expo-camera` com modo vídeo
- Controles: botão gravar/parar, flip câmera (frente/traseira)
- Timer de duração visível durante gravação
- Suporte web parcial (sem flip de câmera no browser)

#### 6.3 Live Guidance (Simulado)
Durante a gravação, o hook `useLiveAnalysis` roda a cada **400ms** e fornece dicas visuais em tempo real:

| Condição | Tipo | Mensagem |
|---|---|---|
| Sem mãos detectadas por >2s | warning | "Keep your hands visible" |
| Face detectada por >1s | error | "Face detected — adjust camera" |
| Baixa luminosidade por >2.5s | warning | "Move to a brighter area" |

> **Nota:** A detecção na live guidance atualmente usa `Math.random()` como simulação. A detecção real com MediaPipe está implementada apenas na análise pós-gravação (review).

#### 6.4 Estabilidade
- O hook `useStabilityTracker` coleta dados do acelerômetro durante toda a gravação
- Calcula "jitter" como variância dos vetores de aceleração
- Score convertido para 0–100 (maior = mais estável)
- Passado via `params` para a tela de review

---

## 7. Pipeline de QC (Quality Control)

### Visão geral do fluxo
```
Gravação concluída
        ↓
app/review.tsx — chama analyzeVideo(videoUri)
        ↓
lib/mediapipe-analyzer.ts — extrai frames a 5 FPS, analisa cada frame
        ↓
lib/qc-engine.ts — agrega métricas e calcula readiness score
        ↓
Exibe relatório → usuário confirma, sobe mesmo assim, ou regrava
```

### 7.1 Extração de Frames (`lib/mediapipe-analyzer.ts`)
- Plataforma web: usa `<video>` + `<canvas>` ocultos no DOM
- Taxa de amostragem: **5 FPS** (sem cap de frames — análise completa)
- Canvas configurado com `willReadFrequently: true`
- URIs do tipo `blob://` ou `file://` sem `crossOrigin="anonymous"` (evita canvas taint)
- Erros `SecurityError` tratados separadamente de erros de draw

### 7.2 MediaPipe
- Versão: **0.10.32** (chave de singleton `mp-0.10.32` para invalidar cache stale entre HMR)
- WASM carregado via jsDelivr com fallback para unpkg
- **HandLandmarker**: detecta até 2 mãos, calcula bounding box e score de confiança
- **FaceLandmarker**: detecta presença de rosto (usado para privacidade, não FaceDetector — modelo 404)
- Singleton com lazy init: inicializa uma vez e reutiliza por todo o ciclo de vida do app

### 7.3 Análise de Brilho
- Fórmula: `Y = 0.299R + 0.587G + 0.114B` (luminância ponderada)
- Correção gamma: `Math.pow(Y / 255, 1/2.2) * 100` para percepção humana
- Exemplo: 107/255 linear (42%) → ~67% perceptual (elimina falsos "Very Low")

### 7.4 Thresholds Padrão (`lib/qc-types.ts` → `DEFAULT_QC_THRESHOLDS`)

| Métrica | Threshold | Tipo |
|---|---|---|
| Duração mínima | 5 segundos | bloqueante |
| Duração máxima | 600 segundos | bloqueante |
| Presença de mãos | ≥ 60% dos frames | bloqueante |
| Presença de rosto | ≤ 15% dos frames | bloqueante |
| Luminosidade | ≥ 35/100 | warning |
| Estabilidade | ≥ 40/100 | warning |
| Blur/Nitidez | ≥ 40/100 | warning |
| Orientação | landscape | bloqueante |

### 7.5 Scoring Engine (`lib/qc-engine.ts`)

O **Readiness Score** (0–100) é uma média ponderada:

| Componente | Peso |
|---|---|
| Presença de mãos | 20% |
| Duração | 15% |
| Orientação | 12% |
| Privacidade (sem rosto) | 12% |
| Nitidez (blur) | 10% |
| Continuidade de mãos | 10% |
| Enquadramento (centralização) | 8% |
| Luminosidade | 7% |
| Estabilidade | 6% |

### 7.6 Resultados Possíveis

| Resultado | Condição |
|---|---|
| **Passed** | Score ≥ 85, sem bloqueios ou warnings críticos |
| **Passed with Warning** | Score entre 65–84, ou issues não críticos |
| **Blocked** | Score < 65, ou qualquer razão de bloqueio ativa |

### 7.7 Tela de Review (`app/review.tsx`)
- Exibe score visual com cor (verde/amarelo/vermelho)
- Lista de razões de bloqueio (se houver)
- Lista de avisos
- Detalhes por métrica: mãos, rosto, brilho, nitidez, estabilidade, orientação, duração
- Ações:
  - **Confirm Upload** (passed / passed_with_warning sem bloqueio)
  - **Upload Anyway** (passed_with_warning com aviso não crítico)
  - **Re-record** (blocked — obrigatório)
- Versão do QC engine (`QC_VERSION`) incluída no payload enviado

---

## 8. Upload para S3

### Arquitetura
O upload usa **S3 Multipart Upload** com URLs pré-assinadas, evitando que o arquivo passe pelo servidor:

```
Frontend                    Backend                      AWS S3
    |                          |                            |
    |-- POST /initiate -------->|                            |
    |<-- { uploadId, s3Key } ---|-- CreateMultipartUpload -->|
    |                          |<-- uploadId ---------------|
    |                          |                            |
    | (para cada chunk de 120MB):                           |
    |-- POST /part-url -------->|                            |
    |<-- { presignedUrl } ------|-- GetSignedUrl ----------->|
    |                          |<-- url --------------------|
    |-- PUT chunk ------------ | ---------- presignedUrl -->|
    |<-- ETag --------------------------------- ETag --------|
    |                          |                            |
    |-- POST /complete -------->|                            |
    |                          |-- CompleteMultipart ------>|
    |<-- { location } ----------|<-- S3 URL -----------------|
```

### 8.1 Rotas de Upload
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/uploads/initiate` | Cria multipart upload, retorna `uploadId` + `s3Key` |
| POST | `/api/uploads/part-url` | Gera URL pré-assinada para um chunk específico |
| POST | `/api/uploads/complete` | Finaliza o upload com lista de ETags |
| POST | `/api/uploads/abort` | Cancela e limpa o upload em caso de erro |
| POST | `/api/submissions` | Cria registro de submissão no servidor |
| POST | `/api/submissions/:id/confirm` | Confirma upload concluído com S3 URL |

### 8.2 Upload Service (`lib/upload-service.ts`)
- Chunk size: **120 MB**
- Lê o arquivo como `Blob` via `fetch(videoUri)` — funciona em web e nativo
- Divide com `blob.slice(start, end)` por chunk
- Em caso de falha em qualquer parte, chama `/api/uploads/abort` automaticamente
- Callback `onProgress(chunkIndex, totalChunks, bytesUploaded, totalBytes)`

### 8.3 S3 Key Pattern
```
recordings/{questId}/{recordingId}_{timestamp}.mp4
```

### 8.4 Configuração S3 Necessária
- Block Public Access: **todos os 4 toggles ON** (acesso via pre-signed URLs apenas)
- CORS obrigatório para versão web:
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["PUT"],
  "AllowedOrigins": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```
- Credenciais via secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION`

### 8.5 Tela de Uploads (`app/(tabs)/uploads.tsx`)
- Lista de gravações com status: `queued` | `uploading` | `uploaded` | `failed` | `retrying`
- Barra de progresso em tempo real mostrando `%` e `chunk X/Y`
- Botões de retry e remover por item
- Botão "Retry All" para reenviar todos os falhos de uma vez
- URIs `simulated://` pulam o upload real (modo desenvolvimento)
- QC score exibido por badge em cada item

---

## 9. Design System

### Paleta de Cores
| Token | Valor | Uso |
|---|---|---|
| `primary` | `#00D4AA` | Ações principais, destaques |
| `accent` | `#0EA5E9` | Upload, info, progresso |
| `background` (dark) | `#0A0E1A` | Fundo principal |
| `card` (dark) | `#111827` | Cards e superfícies |
| `success` | `#22C55E` | QC passed |
| `warning` | `#F59E0B` | QC warnings |
| `error` | `#EF4444` | QC blocked, falhas |

### Tipografia
- Família: **Inter** (Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold)
- Carregada via `@expo-google-fonts/inter` com splash screen gate

### Regras de UI
- Sem emojis — apenas ícones via @expo/vector-icons (Ionicons)
- Safe area via `useSafeAreaInsets()` — sem padding hardcoded
- Web insets: `paddingTop: 67` no header, `paddingBottom: 34` no bottom

---

## 10. Estado Local e Persistência

### `RecordingsContext`
- Armazenado em `AsyncStorage` como JSON
- Campos por Recording: `id`, `questId`, `questTitle`, `uri`, `duration`, `fileSize`, `createdAt`, `uploadStatus`, `submissionId?`, `thumbnailUri?`, `qcReport?`, `deviceOrientation?`
- Métodos: `addRecording()`, `updateUploadStatus()`, `removeRecording()`

### `AuthContext`
- Token JWT em `SecureStore` (iOS/Android) ou `AsyncStorage` (web)
- Auto-login ao iniciar o app se token existir
- Validação via `/api/auth/me`

---

## 11. Limitações e Pendências Conhecidas

| Item | Status | Descrição |
|---|---|---|
| Live guidance ML real | Pendente | Usa `Math.random()` — MediaPipe real apenas no review |
| MediaPipe nativo | Pendente | Funciona apenas na web (WASM); nativo requer EAS Build |
| Quests dinâmicos | Pendente | Lista hardcoded no servidor |
| DB persistência | Parcial | Submissões não persistidas em DB (apenas em memória) |
| Sessões em memória | Risco | Reiniciar servidor invalida todos os tokens |
| `test-qc.tsx` | DEV ONLY | Remover antes do release |
| Upload nativo chunks grandes | Limitação | `fetch(file://)` carrega arquivo inteiro em memória antes de fatiá-lo |

---

## 12. Variáveis de Ambiente (Secrets)

| Secret | Descrição |
|---|---|
| `AWS_ACCESS_KEY_ID` | Chave de acesso IAM |
| `AWS_SECRET_ACCESS_KEY` | Chave secreta IAM |
| `AWS_S3_BUCKET` | Nome do bucket S3 |
| `AWS_S3_REGION` | Região do bucket (ex: `sa-east-1`) |
| `SESSION_SECRET` | Secret para assinatura de sessões |
