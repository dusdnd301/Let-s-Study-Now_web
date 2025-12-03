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
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // JSON 파싱 실패 시 기본 메시지 사용
        }

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

        throw new Error(errorMessage);
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
  id?: number; // ✅ string에서 number로 변경
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
  id: number;  // ✅ Swagger: id
  type: MessageType;
  roomType: RoomType;
  roomId: number;
  sender: string;
  message: string;
  refId?: number;
  isSolved?: boolean;
  isSelected?: boolean;  // ✅ Swagger에 있음
  sentAt: string;  // ✅ Swagger: sentAt
  imageUrl?: string;
}

// ✅ 채팅 메시지 전송 요청
export interface SendChatMessageRequest {
  type: MessageType;
  roomType: RoomType;
  roomId: number;
  message: string;
  refId?: number; // 답변일 경우 필수
}

// ✅ 오픈 스터디룸 참여자 타입 (백엔드 ParticipantResponseDto와 일치)
export interface OpenStudyParticipant {
  memberId: number;
  nickname: string;
  profileImage?: string;
  timerStatus: "STUDYING" | "RESTING"; // ✅ PersonalTimer가 없으면 기본값 RESTING 반환
}

// ✅ 오픈 스터디룸 타입 (백엔드 스키마 기준)
export interface OpenStudyRoom {
  id: number;
  title: string; // ✅ 프론트에서 사용하는 필드명
  roomName?: string; // ✅ 백엔드 응답 필드명
  description?: string;
  maxParticipants: number;
  currentParticipants: number;
  studyField: string;
  isFull: boolean;
  creatorUsername: string;
  createdAt?: string;
  isActive?: boolean;
  createdBy?: number; // ✅ string에서 number로 변경
  participants?: OpenStudyParticipant[]; // ✅ 참여자 목록
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

// ✅ 그룹 스터디룸 타입 (백엔드 스키마 기준)
export interface GroupStudyRoom {
  id: number;
  groupId: number;
  roomName: string; // ✅ 백엔드는 roomName 사용
  studyField: string;
  studyHours: number;
  maxMembers: number;
  currentMembers: number;
  creatorId: number;
  createdAt: string;
  endTime: string;
  status: string;
  remainingMinutes: number;
}

export interface Group {
  id: number;
  groupName: string;
  leaderId: number;
  createdAt: string;
  memberCount?: number; // ✅ 그룹 참여자 수
}

export interface GroupMember {
  id: number;
  memberId: number;
  role: string;
  joinedAt: string;
}

// ✅ 스터디룸 참여자 타입
export interface StudyRoomParticipant {
  memberId: number;
  username: string;
  profileImageUrl?: string;
  timerStatus: "STUDYING" | "RESTING";
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
  progress: number; // 0~100%
}

// ✅ 세션 응답 DTO (백엔드 SessionResponseDto와 일치)
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
  // ✅ 로그인 - 토큰 문자열 반환
  login: async (data: LoginRequest): Promise<string> => {
    const token = await apiClient.post<string>("/api/loginAct", data);
    // ✅ 토큰 저장
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
    // ✅ 로그아웃 시 토큰 삭제
    tokenManager.removeToken();
    return result;
  },

  updateProfile: (data: FormData) => {
    // ✅ PATCH 메서드 사용, FormData 직접 전송
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
  // ✅ 채팅 내역 조회 - 배열로 반환
  getChatHistory: (roomId: number, roomType: RoomType = "OPEN", page: number = 0, size: number = 20) =>
    apiClient.get<ChatMessage[]>(
      `/api/chat/room/${roomId}?roomType=${roomType}&page=${page}&size=${size}`
    ),

  // ✅ 메시지 삭제 - string 반환
  deleteMessage: (messageId: number) =>
    apiClient.delete<string>(`/api/chat/message/${messageId}`),

  // ✅ 이미지 업로드 - string(URL) 반환
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post<string>("/api/chat/image", formData);
  },

  // ✅ 질문 해결 처리 (답변 채택 포함) - string 반환
  solveQuestion: (questionId: number, answerId?: number) => {
    const url = answerId
      ? `/api/chat/message/${questionId}/solve?answerId=${answerId}`
      : `/api/chat/message/${questionId}/solve`;
    return apiClient.patch<string>(url);
  },
};

// 👥 그룹 관련
export const groupAPI = {
  getAllGroups: () => apiClient.get<Group[]>("/api/groups"),
  getMyGroups: () => apiClient.get<Group[]>("/api/groups/my"),
  getMyGroupsWithId: (leaderId: number) =>
    apiClient.get<Group[]>(`/api/groups/my?leaderId=${leaderId}`),
  // ✅ leaderId는 JWT에서 자동 추출되므로 선택적
  createGroup: (data: { groupName: string; leaderId?: number }) =>
    apiClient.post<Group>("/api/groups", data),
  getGroup: (groupId: number) => apiClient.get<Group>(`/api/groups/${groupId}`),
  deleteGroup: (groupId: number, userId?: number) =>
    apiClient.delete<{ message: string }>(
      `/api/groups/${groupId}${userId ? `?userId=${userId}` : ""}`
    ),
  getMembers: (groupId: number) =>
    apiClient.get<GroupMember[]>(`/api/groups/${groupId}/members`),
  addMember: (groupId: number, memberId: number) =>
    apiClient.post<GroupMember>(`/api/groups/${groupId}/members`, {
      groupId,
      memberId,
    }),
  removeMember: (groupId: number, memberId: number, requesterId?: number) =>
    apiClient.delete<{ message: string }>(
      `/api/groups/${groupId}/members/${memberId}${
        requesterId ? `?requesterId=${requesterId}` : ""
      }`
    ),
};

// 🧠 오픈 스터디 관련
export const openStudyAPI = {
  // ✅ GET /api/open-study/rooms - 필터링 및 페이지네이션 지원
  getRooms: (studyField?: string, page: number = 1) => {
    const params = new URLSearchParams();
    if (studyField) params.append("studyField", studyField);
    params.append("page", page.toString());

    const queryString = params.toString();
    return apiClient.get<PageResponse<OpenStudyRoom>>(
      `/api/open-study/rooms${queryString ? `?${queryString}` : ""}`
    );
  },

  // ✅ POST /api/open-study/rooms - 백엔드는 title 사용
  createRoom: (data: {
    title: string;
    description?: string;
    studyField: string;
    maxParticipants: number;
  }) => apiClient.post<OpenStudyRoom>("/api/open-study/rooms", data),

  // ✅ GET /api/open-study/rooms/{roomId}
  getRoom: (roomId: string | number) =>
    apiClient.get<OpenStudyRoom>(`/api/open-study/rooms/${roomId}`),

  // ✅ POST /api/open-study/rooms/{roomId}/join
  joinRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(`/api/open-study/rooms/${roomId}/join`),

  // ✅ POST /api/open-study/rooms/{roomId}/leave
  leaveRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(
      `/api/open-study/rooms/${roomId}/leave`
    ),

  // ✅ DELETE /api/open-study/rooms/{roomId}
  deleteRoom: (roomId: string | number) =>
    apiClient.delete<{ message: string }>(`/api/open-study/rooms/${roomId}`),

  // ✅ GET /api/open-study/study-fields
  getStudyFields: () => apiClient.get<string[]>("/api/open-study/study-fields"),

  // ✅ GET /api/open-study/rooms/{roomId}/participants
  // 참여자 목록 조회 - PersonalTimer와 Member 정보를 결합하여 반환
  // 타이머가 없는 경우 기본값 RESTING으로 설정됨
  getParticipants: (roomId: string | number) =>
    apiClient.get<OpenStudyParticipant[]>(
      `/api/open-study/rooms/${roomId}/participants`
    ),
};

// 📚 그룹 스터디룸 관련
export const studyRoomAPI = {
  // ✅ GET /api/study-rooms
  getAllRooms: () => apiClient.get<GroupStudyRoom[]>("/api/study-rooms"),

  // ✅ POST /api/study-rooms - creatorId는 JWT에서 자동 추출
  createRoom: (data: {
    groupId: number;
    roomName: string;
    studyField: string;
    studyHours: number;
    maxMembers: number;
    creatorId?: number;
  }) => apiClient.post<GroupStudyRoom>("/api/study-rooms", data),

  // ✅ GET /api/study-rooms/{roomId}
  getRoom: (roomId: string | number) =>
    apiClient.get<GroupStudyRoom>(`/api/study-rooms/${roomId}`),

  // ✅ POST /api/study-rooms/{roomId}/join - memberId는 JWT에서 자동 추출
  joinRoom: (roomId: string | number, memberId?: number) =>
    apiClient.post<{ message: string }>(
      `/api/study-rooms/${roomId}/join${
        memberId ? `?memberId=${memberId}` : ""
      }`
    ),

  // ✅ POST /api/study-rooms/{roomId}/leave - memberId는 JWT에서 자동 추출
  leaveRoom: (roomId: string | number, memberId?: number) =>
    apiClient.post<{ message: string }>(
      `/api/study-rooms/${roomId}/leave${
        memberId ? `?memberId=${memberId}` : ""
      }`
    ),

  // ✅ POST /api/study-rooms/{roomId}/end
  endRoom: (roomId: string | number) =>
    apiClient.post<{ message: string }>(`/api/study-rooms/${roomId}/end`),

  // ✅ GET /api/study-rooms/group/{groupId}
  getGroupRooms: (groupId: string | number) =>
    apiClient.get<GroupStudyRoom[]>(`/api/study-rooms/group/${groupId}`),

  // ✅ GET /api/study-rooms/{roomId}/participants - 참여자 목록 조회
  getParticipants: (roomId: string | number) =>
    apiClient.get<StudyRoomParticipant[]>(
      `/api/study-rooms/${roomId}/participants`
    ),

  // ✅ DELETE /api/study-rooms/{roomId} - memberId는 JWT에서 자동 추출
  deleteRoom: (roomId: string | number, memberId?: number) =>
    apiClient.delete<{ message: string }>(
      `/api/study-rooms/${roomId}${memberId ? `?memberId=${memberId}` : ""}`
    ),
};

// ✅ 체크리스트 관련
export const checklistAPI = {
  // GET: 특정 날짜의 체크리스트 조회
  getChecklists: (date: string) =>
    apiClient.get<Checklist[]>(`/api/checklist?date=${date}`),

  // POST: 체크리스트 생성 - targetDate 사용
  createChecklist: (data: { targetDate: string; content: string }) =>
    apiClient.post<Checklist>("/api/checklist", data),

  // PUT: 체크리스트 내용 수정 - content 객체로 전달
  updateChecklist: (checklistId: string, data: { content: string }) =>
    apiClient.put<Checklist>(`/api/checklist/${checklistId}`, data),

  // DELETE: 체크리스트 삭제
  deleteChecklist: (checklistId: string) =>
    apiClient.delete<{ message: string }>(`/api/checklist/${checklistId}`),

  // PATCH: 체크리스트 완료/미완료 토글
  toggleChecklist: (checklistId: string) =>
    apiClient.patch<Checklist>(`/api/checklist/${checklistId}/toggle`),

  // GET: 월별 체크리스트 요약 (날짜 목록)
  getMonthSummary: (year: number, month: number) =>
    apiClient.get<{ dates: string[] }>(
      `/api/checklist/month-summary?year=${year}&month=${month}`
    ),
};

// ⏱️ 타이머 관련
export const timerAPI = {
  // POST /api/timer/start - 타이머 시작
  startTimer: (roomId: number, isRoomCreator: boolean) => {
    const params = new URLSearchParams();
    params.append("roomId", roomId.toString());
    params.append("isRoomCreator", isRoomCreator.toString());
    return apiClient.post<TimerStatusResponse>(
      `/api/timer/start?${params.toString()}`
    );
  },

  // POST /api/timer/end - 타이머 종료
  endTimer: () => apiClient.post<void>("/api/timer/end"),

  // GET /api/timer/status - 타이머 상태 조회
  getTimerStatus: () => apiClient.get<TimerStatusResponse>("/api/timer/status"),
};

// 📊 스터디 세션 관련
export const sessionAPI = {
  // POST /api/study-sessions/start - 스터디 세션 시작
  startSession: (request: SessionStartRequestDto) =>
    apiClient.post<SessionResponseDto>("/api/study-sessions/start", request),

  // POST /api/study-sessions/{sessionId}/end - 스터디 세션 종료
  endSession: (sessionId: number) =>
    apiClient.post<SessionEndResultDto>(
      `/api/study-sessions/${sessionId}/end`
    ),

  // GET /api/study-sessions/level - 레벨 정보 조회
  getLevelInfo: () => apiClient.get<LevelInfoDto>("/api/study-sessions/level"),
};