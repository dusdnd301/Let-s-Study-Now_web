// src/lib/api.ts

// ✅ API 기본 설정
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ✅ 토큰 관리 유틸리티 (export 필수!)
export const tokenManager = {
  setToken: (token: string) => {
    localStorage.setItem("authToken", token);
  },
  getToken: (): string | null => {
    return localStorage.getItem("authToken");
  },
  removeToken: () => {
    localStorage.removeItem("authToken");
  },
  hasToken: (): boolean => {
    return !!localStorage.getItem("authToken");
  },
};

// ✅ 공통 API 클라이언트
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    // ✅ FormData면 Content-Type 자동 설정 안 함 (브라우저가 boundary 붙임)
    const isFormData = options.body instanceof FormData;

    // ✅ 토큰 헤더 추가
    const token = tokenManager.getToken();
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const config: RequestInit = {
      headers: isFormData
        ? { ...authHeaders, ...options.headers }
        : {
            "Content-Type": "application/json",
            ...authHeaders,
            ...options.headers,
          },
      credentials: "include", // ✅ 쿠키 자동 전송 (세션 기반 인증 필수)
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        // ✅ 서버에서 보낸 에러 메시지 파싱
        let errorMessage = `HTTP error! status: ${response.status}`;
        let errorDetails: any = null;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorDetails = await response.json();
            if (errorDetails.message) {
              errorMessage = errorDetails.message;
            } else if (errorDetails.error) {
              errorMessage = errorDetails.error;
            }
          } else {
            // JSON이 아닌 경우 텍스트로 시도
            const textError = await response.text();
            if (textError) {
              errorMessage = textError;
              errorDetails = { raw: textError };
            }
          }
        } catch (e) {
          // 파싱 실패 시 기본 메시지 사용
        }

        // 디버깅을 위한 상세 로그
        console.error("❌ API 에러 상세:", {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorDetails,
        });

        // 인증 실패 시 로그인 페이지로 리다이렉트
        if (response.status === 401) {
          console.warn("세션이 만료되었습니다. 다시 로그인하세요.");
          tokenManager.removeToken(); // 토큰 삭제

          // ✅ 공개 페이지에서는 리다이렉트하지 않음
          const publicPaths = ["/", "/login", "/register"];
          const currentPath = window.location.hash.replace("#", "") || "/";
          const isPublicPath = publicPaths.some((path) =>
            currentPath.startsWith(path)
          );

          // 보호된 페이지에서만 로그인 페이지로 리다이렉트
          if (!isPublicPath) {
            window.location.href = "#/login";
          }
        }

        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).details = errorDetails;
        throw error;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      // ✅ 텍스트 응답 (토큰 문자열 등)
      return response.text() as unknown as T;
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const isFormData = data instanceof FormData;
    return this.request<T>(endpoint, {
      method: "POST",
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const isFormData = data instanceof FormData;
    return this.request<T>(endpoint, {
      method: "PUT",
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    const isFormData = data instanceof FormData;
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "DELETE",
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

//
// ✅ 타입 정의
//
export interface User {
  id?: number;
  email: string;
  username: string;
  level?: number;
  exp?: number;
  profileImageUrl?: string;
  profileImage?: string;
  bio?: string;
  studyFields?: string[];
  studyField?: string;
  notificationEnabled?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  checkPassword: string;
  profileImageFile?: File | string;
  studyField: string;
  bio?: string;
  checkPw: boolean;
}

// ✅ 채팅 메시지 타입
export type MessageType = "TALK" | "QUESTION" | "ANSWER" | "SOLVE" | "SYSTEM";
export type RoomType = "OPEN" | "GROUP";

export interface ChatMessage {
  id: number;
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

// ✅ 채팅 메시지 전송 요청
export interface SendChatMessageRequest {
  type: MessageType;
  roomType: RoomType;
  roomId: number;
  message: string;
  refId?: number;
}

// ✅ 오픈 스터디룸 참여자 타입
export interface OpenStudyParticipant {
  memberId: number;
  nickname: string;
  profileImage?: string;
  timerStatus: "STUDYING" | "RESTING";
}

// ✅ 오픈 스터디룸 타입
export interface OpenStudyRoom {
  id: number;
  title: string;
  roomName?: string;
  description?: string;
  maxParticipants: number;
  currentParticipants: number;
  studyField: string;
  isFull: boolean;
  creatorUsername: string;
  createdAt?: string;
  isActive?: boolean;
  createdBy?: number;
  participants?: OpenStudyParticipant[];
}

// ✅ 페이지네이션 응답 타입
export interface PageResponse<T> {
  content: T[];
  currentPage: number;
  totalPages: number;
  totalElements: number;
  size: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ✅ 그룹 스터디룸 타입 (Swagger 스펙 기준)
export interface GroupStudyRoom {
  id: number;
  groupId: number;
  roomName: string;
  studyField: string;
  studyHours: number;
  maxMembers: number;
  currentMembers: number;
  creatorId: number;
  creatorUsername?: string; // ✅ 별도 조회 필요 (API 응답에 없음)
  createdAt: string;
  endTime: string;
  status: string;
  remainingMinutes: number;
}

// ✅ 그룹 타입 (Swagger 스펙 기준)
export interface Group {
  id: number;
  groupName: string;
  leaderId: number;
  createdAt: string;
  memberCount: number; // ✅ Swagger에 있음
}

// ✅ 그룹 멤버 타입 (Swagger 스펙 기준)
export interface GroupMember {
  id: number;
  memberId: number;
  role: string;
  joinedAt: string;
}

// ✅ 스터디룸 참여자 타입 (Swagger 스펙 기준)
export interface StudyRoomParticipant {
  id: number; // ✅ Swagger 스펙에 있음
  memberId: number;
  username?: string; // ✅ API 응답에 없음 (별도 조회 필요)
  profileImageUrl?: string;
  timerStatus?: "STUDYING" | "RESTING";
  joinedAt: string;
}

// ✅ 체크리스트 타입
export interface Checklist {
  id: string;
  content: string;
  targetDate: string;
  completed: boolean;
  createdAt: string;
}

// ✅ 타이머 관련 타입
export type TimerMode = "STUDY" | "REST";
export type TimerStatus = "RUNNING" | "PAUSED" | "STOPPED";

export interface TimerStatusResponse {
  timerId: number;
  memberId: number;
  roomId: number;
  timerMode: TimerMode;
  timerStatus: TimerStatus;
  currentSessionSeconds: number;
  totalStudySeconds: number;
  totalStudyTime: string;
}

// ✅ 스터디 세션 관련 타입
export interface SessionStartRequestDto {
  studyType: string;
  roomId: number;
}

export interface SessionEndResultDto {
  sessionId: number;
  studyMinutes: number;
  leveledUp: boolean;
  newLevel: number | null;
}

export interface LevelInfoDto {
  memberId: number;
  username: string;
  currentLevel: number;
  totalExp: number;
  currentLevelExp: number;
  requiredExpForNextLevel: number;
  remainingExp: number;
  progress: number;
}

export interface SessionResponseDto {
  sessionId: number;
  memberId: number;
  studyType: string;
  roomId: number;
  mode: string;
  studyMinutes: number;
  startTime: string;
  endTime: string | null;
  isActive: boolean;
}

//
// ✅ API 함수들
//

// 🔐 인증 관련
export const authAPI = {
  login: async (data: LoginRequest): Promise<string> => {
    const token = await apiClient.post<string>("/api/loginAct", data);
    tokenManager.setToken(token);
    return token;
  },

  register: (data: RegisterRequest) => {
    if (data.profileImageFile && data.profileImageFile instanceof File) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null)
          formData.append(key, value as any);
      });
      return apiClient.post<{ message: string }>("/api/registerAct", formData);
    } else {
      const jsonData = { ...data };
      delete jsonData.profileImageFile;
      return apiClient.post<{ message: string }>("/api/registerAct", jsonData);
    }
  },

  getProfile: () => apiClient.get<User>("/api/profile"),

  logout: async () => {
    const result = await apiClient.post<{ message: string }>("/api/logout");
    tokenManager.removeToken();
    return result;
  },

  updateProfile: (data: FormData) => {
    return apiClient.patch<User>("/api/update/profile", data);
  },

  updatePassword: (data: {
    currentPassword: string;
    newPassword: string;
    newPasswordCheck: string;
  }) => apiClient.patch<{ message: string }>("/api/update/password", data),

  deleteAccount: (password: string) =>
    apiClient.delete<{ message: string }>("/api/delete/account", { password }),
};

// 💬 채팅 관련 API
export const chatAPI = {
  getChatHistory: (roomId: number, roomType: RoomType = "OPEN", page: number = 0, size: number = 20) =>
    apiClient.get<ChatMessage[]>(
      `/api/chat/room/${roomId}?roomType=${roomType}&page=${page}&size=${size}`
    ),

  deleteMessage: (messageId: number) =>
    apiClient.delete<string>(`/api/chat/message/${messageId}`),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post<string>("/api/chat/image", formData);
  },

  solveQuestion: (questionId: number, answerId?: number) => {
    const url = answerId
      ? `/api/chat/message/${questionId}/solve?answerId=${answerId}`
      : `/api/chat/message/${questionId}/solve`;
    return apiClient.patch<string>(url);
  },
};

// 👥 그룹 관련 (Swagger 스펙 기준)
export const groupAPI = {
  // ✅ GET /api/groups - 전체 그룹 목록
  getAllGroups: () => apiClient.get<Group[]>("/api/groups"),

  // ✅ GET /api/groups/my - 내 그룹 목록
  getMyGroups: () => apiClient.get<Group[]>("/api/groups/my"),

  // ✅ POST /api/groups - 그룹 생성 (leaderId는 JWT에서 자동 추출)
  createGroup: (data: { groupName: string }) =>
    apiClient.post<Group>("/api/groups", data),

  // ✅ GET /api/groups/{groupId} - 그룹 조회
  getGroup: (groupId: number) => apiClient.get<Group>(`/api/groups/${groupId}`),

  // ✅ DELETE /api/groups/{groupId} - 그룹 삭제
  deleteGroup: (groupId: number) =>
    apiClient.delete<{ message: string }>(`/api/groups/${groupId}`),

  // ✅ GET /api/groups/{groupId}/members - 멤버 목록 조회
  getMembers: (groupId: number) =>
    apiClient.get<GroupMember[]>(`/api/groups/${groupId}/members`),

  // ✅ POST /api/groups/{groupId}/members - 멤버 추가
  addMember: (groupId: number, memberId: number) =>
    apiClient.post<GroupMember>(
      `/api/groups/${groupId}/members?memberId=${memberId}`
    ),

  // ✅ DELETE /api/groups/{groupId}/members/{memberId} - 멤버 추방
  removeMember: (groupId: number, memberId: number, requesterId: number) =>
    apiClient.delete<{ message: string }>(
      `/api/groups/${groupId}/members/${memberId}?requesterId=${requesterId}`
    ),
};

// 🧠 오픈 스터디 관련
export const openStudyAPI = {
  getRooms: (studyField?: string, page: number = 1) => {
    const params = new URLSearchParams();
    if (studyField) params.append("studyField", studyField);
    params.append("page", page.toString());

    const queryString = params.toString();
    return apiClient.get<PageResponse<OpenStudyRoom>>(
      `/api/open-study/rooms${queryString ? `?${queryString}` : ""}`
    );
  },

  createRoom: (data: {
    title: string;
    description?: string;
    studyField: string;
    maxParticipants: number;
  }) => apiClient.post<OpenStudyRoom>("/api/open-study/rooms", data),

  getRoom: (roomId: string | number) =>
    apiClient.get<OpenStudyRoom>(`/api/open-study/rooms/${roomId}`),

  joinRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(`/api/open-study/rooms/${roomId}/join`),

  leaveRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(
      `/api/open-study/rooms/${roomId}/leave`
    ),

  deleteRoom: (roomId: string | number) =>
    apiClient.delete<{ message: string }>(`/api/open-study/rooms/${roomId}`),

  getStudyFields: () => apiClient.get<string[]>("/api/open-study/study-fields"),

  getParticipants: (roomId: string | number) =>
    apiClient.get<OpenStudyParticipant[]>(
      `/api/open-study/rooms/${roomId}/participants`
    ),
};

// 📚 그룹 스터디룸 관련 (Swagger 스펙 기준)
export const studyRoomAPI = {
  // ✅ GET /api/study-rooms - 전체 스터디방 목록
  getAllRooms: () => apiClient.get<GroupStudyRoom[]>("/api/study-rooms"),

  // ✅ POST /api/study-rooms - 스터디방 생성 (creatorId는 JWT에서 자동 추출)
  createRoom: (data: {
    groupId: number;
    roomName: string;
    studyField: string;
    studyHours: number;
    maxMembers: number;
  }) => apiClient.post<GroupStudyRoom>("/api/study-rooms", data),

  // ✅ GET /api/study-rooms/{roomId} - 스터디방 조회
  getRoom: (roomId: string | number) =>
    apiClient.get<GroupStudyRoom>(`/api/study-rooms/${roomId}`),

  // ✅ POST /api/study-rooms/{roomId}/join - 스터디방 입장 (memberId는 필수 쿼리 파라미터)
  joinRoom: (roomId: string | number, memberId: number) =>
    apiClient.post<{ message: string }>(
      `/api/study-rooms/${roomId}/join?memberId=${memberId}`
    ),

  // ✅ POST /api/study-rooms/{roomId}/leave - 스터디방 퇴장 (memberId는 필수 쿼리 파라미터)
  leaveRoom: (roomId: string | number, memberId: number) =>
    apiClient.post<{ message: string }>(
      `/api/study-rooms/${roomId}/leave?memberId=${memberId}`
    ),

  // ✅ POST /api/study-rooms/{roomId}/end - 스터디방 종료
  endRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(`/api/study-rooms/${roomId}/end`),

  // ✅ GET /api/study-rooms/group/{groupId} - 그룹 스터디방 목록
  getGroupRooms: (groupId: string | number) =>
    apiClient.get<GroupStudyRoom[]>(`/api/study-rooms/group/${groupId}`),

  // ✅ GET /api/study-rooms/{roomId}/participants - 참여자 목록 조회
  getParticipants: (roomId: string | number) =>
    apiClient.get<StudyRoomParticipant[]>(
      `/api/study-rooms/${roomId}/participants`
    ),

  // ✅ DELETE /api/study-rooms/{roomId} - 스터디방 삭제 (memberId는 필수 쿼리 파라미터)
  deleteRoom: (roomId: string | number, memberId: number) =>
    apiClient.delete<{ message: string }>(
      `/api/study-rooms/${roomId}?memberId=${memberId}`
    ),
};

// ✅ 체크리스트 관련
export const checklistAPI = {
  getChecklists: (date: string) =>
    apiClient.get<Checklist[]>(`/api/checklist?date=${date}`),

  createChecklist: (data: { targetDate: string; content: string }) =>
    apiClient.post<Checklist>("/api/checklist", data),

  updateChecklist: (checklistId: string, data: { content: string }) =>
    apiClient.put<Checklist>(`/api/checklist/${checklistId}`, data),

  deleteChecklist: (checklistId: string) =>
    apiClient.delete<{ message: string }>(`/api/checklist/${checklistId}`),

  toggleChecklist: (checklistId: string) =>
    apiClient.patch<Checklist>(`/api/checklist/${checklistId}/toggle`),

  getMonthSummary: (year: number, month: number) =>
    apiClient.get<{ dates: string[] }>(
      `/api/checklist/month-summary?year=${year}&month=${month}`
    ),
};

// ⏱️ 타이머 관련
export const timerAPI = {
  startTimer: (roomId: number, isRoomCreator: boolean) => {
    const params = new URLSearchParams();
    params.append("roomId", roomId.toString());
    params.append("isRoomCreator", isRoomCreator.toString());
    return apiClient.post<TimerStatusResponse>(
      `/api/timer/start?${params.toString()}`
    );
  },

  endTimer: () => apiClient.post<void>("/api/timer/end"),

  getTimerStatus: () => apiClient.get<TimerStatusResponse>("/api/timer/status"),
};

// 📊 스터디 세션 관련
export const sessionAPI = {
  startSession: (request: SessionStartRequestDto) =>
    apiClient.post<SessionResponseDto>("/api/study-sessions/start", request),

  endSession: (sessionId: number) =>
    apiClient.post<SessionEndResultDto>(
      `/api/study-sessions/${sessionId}/end`
    ),

  getLevelInfo: () => apiClient.get<LevelInfoDto>("/api/study-sessions/level"),
};