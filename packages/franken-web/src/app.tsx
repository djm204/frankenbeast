import { ChatShell } from './components/chat-shell';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined ?? 'http://localhost:3000';
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID as string | undefined ?? 'default';

export function App() {
  return <ChatShell baseUrl={BASE_URL} projectId={PROJECT_ID} />;
}
