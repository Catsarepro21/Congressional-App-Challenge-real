import {create} from 'zustand';
import type {ChatMessage} from '../services/LocalHealthChatEngine';
/** Session-only history survives navigation, but is not saved to disk. */
export const useChatStore = create<{messages: ChatMessage[]; setMessages: (next: ChatMessage[] | ((old: ChatMessage[]) => ChatMessage[])) => void}>(set => ({
  messages:[], setMessages: next => set(state => ({messages:(typeof next === 'function' ? next(state.messages) : next).slice(-40)})),
}));
