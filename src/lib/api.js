const API = '/api';

async function readError(response) {
  try {
    const payload = await response.json();
    return payload.detail || payload.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export const api = {
  health: () => request('/health'),
  agents: () => request('/agents'),
  conversations: () => request('/conversations'),
  conversation: (id) => request(`/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id) => request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export async function streamChat(payload, { signal, onEvent }) {
  const response = await fetch(`${API}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error('Streaming is not supported by this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame) => {
    let event = 'message';
    const data = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    try {
      onEvent(event, JSON.parse(data.join('\n')));
    } catch {
      onEvent('error', { message: 'The server returned an unreadable stream event.' });
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.trim()) dispatch(frame);
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
  } finally {
    reader.releaseLock();
  }
}
