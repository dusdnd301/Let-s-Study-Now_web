// src/lib/websocket.ts

import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { tokenManager } from "./api";

export type MessageType = "TALK" | "QUESTION" | "ANSWER" | "SOLVE" | "SYSTEM";
export type RoomType = "OPEN" | "GROUP";

export interface WebSocketMessage {
  id?: number;  // Swagger 스키마
  messageId?: number;  // 실제 백엔드 응답
  type: MessageType;
  roomType: RoomType;
  roomId: number;
  sender: string;
  message: string;
  refId?: number;
  isSolved?: boolean;
  isSelected?: boolean;
  sentAt: string;
  imageUrl?: string;
}

export interface SendMessagePayload {
  type: MessageType;
  roomType: RoomType;
  roomId: number;
  message: string;
  refId?: number; // ANSWER 타입일 때 필수
}

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, StompSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private shouldReconnect = true; // ✅ 재연결 플래그 추가

  /**
   * WebSocket 연결
   * @param onConnected 연결 성공 시 콜백
   * @param onError 에러 발생 시 콜백
   */
  connect(onConnected?: () => void, onError?: (error: any) => void) {
    if (this.client?.connected) {
      console.log("WebSocket already connected");
      onConnected?.();
      return;
    }

    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
    const token = tokenManager.getToken();

    if (!token) {
      console.error("No auth token found. Cannot connect to WebSocket.");
      onError?.(new Error("No auth token"));
      return;
    }

    // ✅ 연결 시도할 때 재연결 플래그 리셋
    this.shouldReconnect = true;

    this.client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      debug: (str) => {
        console.log("[STOMP Debug]", str);
      },
      reconnectDelay: this.reconnectDelay,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log("✅ WebSocket Connected");
        this.reconnectAttempts = 0;
        onConnected?.();
      },
      onStompError: (frame) => {
        console.error("❌ STOMP Error:", frame.headers["message"]);
        console.error("Details:", frame.body);
        onError?.(frame);
      },
      onWebSocketError: (event) => {
        console.error("❌ WebSocket Error:", event);
        onError?.(event);
      },
      onDisconnect: () => {
        console.warn("⚠️ WebSocket Disconnected");
        // ✅ shouldReconnect가 true일 때만 재연결 시도
        if (this.shouldReconnect) {
          this.handleReconnect(onConnected, onError);
        } else {
          console.log("🚫 Reconnection disabled - will not reconnect");
        }
      },
    });

    this.client.activate();
  }

  /**
   * 재연결 처리
   */
  private handleReconnect(
    onConnected?: () => void,
    onError?: (error: any) => void
  ) {
    // ✅ 재연결 시도 전에도 플래그 확인
    if (!this.shouldReconnect) {
      console.log("🚫 Reconnection disabled");
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      setTimeout(() => {
        // ✅ 실제 연결 전에도 플래그 재확인
        if (this.shouldReconnect) {
          this.connect(onConnected, onError);
        }
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("❌ Max reconnection attempts reached");
      onError?.(new Error("Max reconnection attempts reached"));
    }
  }

  /**
   * 특정 방 구독
   * @param roomId 방 ID
   * @param roomType 방 타입 (OPEN | GROUP)
   * @param onMessage 메시지 수신 시 콜백
   */
  subscribe(
    roomId: number,
    roomType: RoomType,
    onMessage: (message: WebSocketMessage) => void
  ) {
    if (!this.client?.connected) {
      console.error("WebSocket not connected. Cannot subscribe.");
      return;
    }

    const destination = `/sub/chat/${roomType.toLowerCase()}/${roomId}`;
    const subscriptionKey = `${roomType}-${roomId}`;

    // 이미 구독 중이면 중복 구독 방지
    if (this.subscriptions.has(subscriptionKey)) {
      console.log(`Already subscribed to ${destination}`);
      return;
    }

    const subscription = this.client.subscribe(
      destination,
      (message: IMessage) => {
        try {
          const parsedMessage: WebSocketMessage = JSON.parse(message.body);
          console.log("📩 Message received:", parsedMessage);
          onMessage(parsedMessage);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      }
    );

    this.subscriptions.set(subscriptionKey, subscription);
    console.log(`✅ Subscribed to ${destination}`);
  }

  /**
   * 구독 해제
   * @param roomId 방 ID
   * @param roomType 방 타입
   */
  unsubscribe(roomId: number, roomType: RoomType) {
    const subscriptionKey = `${roomType}-${roomId}`;
    const subscription = this.subscriptions.get(subscriptionKey);

    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subscriptionKey);
      console.log(`✅ Unsubscribed from room ${roomId}`);
    }
  }

  /**
   * 메시지 전송
   * @param payload 메시지 페이로드
   */
  sendMessage(payload: SendMessagePayload) {
    if (!this.client?.connected) {
      console.error("WebSocket not connected. Cannot send message.");
      throw new Error("WebSocket not connected");
    }

    const messagePayload = {
      type: payload.type,
      roomType: payload.roomType,
      roomId: payload.roomId,
      message: payload.message,
      ...(payload.refId !== undefined && { refId: payload.refId }),
    };

    this.client.publish({
      destination: "/pub/chat/message",
      body: JSON.stringify(messagePayload),
    });

    console.log("📤 Message sent:", messagePayload);
  }

  /**
   * 연결 해제
   * @param preventReconnect true면 재연결 차단 (기본값), false면 재연결 허용
   */
  disconnect(preventReconnect: boolean = true) {
    // ✅ 재연결 플래그 설정
    this.shouldReconnect = !preventReconnect;
    
    if (this.client) {
      // 모든 구독 해제
      this.subscriptions.forEach((subscription) => subscription.unsubscribe());
      this.subscriptions.clear();

      this.client.deactivate();
      this.client = null;
      
      console.log(
        preventReconnect 
          ? "✅ WebSocket Disconnected (reconnection prevented)" 
          : "✅ WebSocket Disconnected (reconnection allowed)"
      );
    }
  }

  /**
   * 재연결 허용/차단 설정
   * @param allow true면 재연결 허용, false면 차단
   */
  setReconnectEnabled(allow: boolean) {
    this.shouldReconnect = allow;
    console.log(`🔧 Reconnection ${allow ? 'enabled' : 'disabled'}`);
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }
}

// 싱글톤 인스턴스
export const webSocketService = new WebSocketService();