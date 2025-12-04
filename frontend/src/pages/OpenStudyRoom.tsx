import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { 
  openStudyAPI, 
  OpenStudyRoom, 
  sessionAPI, 
  SessionStartRequestDto,
  SessionEndResultDto,
  LevelInfoDto,
  chatAPI,
  ChatMessage as APIChatMessage,
} from "@/lib/api";
import {
  webSocketService,
  WebSocketMessage,
  MessageType,
} from "@/lib/websocket";
import {
  Users,
  Clock,
  Send,
  Paperclip,
  Image as ImageIcon,
  Download,
  LogOut,
  Play,
  Pause,
  Copy,
  TrendingUp,
  BookOpen,
  Coffee,
  HelpCircle,
  MessageCircle,
  X,
  CheckCircle,
  AlertCircle,
  Music,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ChatMessage {
  id: number;
  type: MessageType;
  sender: string;
  senderId?: number;
  senderProfileImage?: string;
  content: string;
  imageUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: Date;
  answers?: HelpAnswer[];
  status?: "open" | "helping" | "resolved";
  refId?: number;
  isSolved?: boolean;
}

interface Participant {
  id: string;
  username: string;
  status: "studying" | "resting";
  isCreator: boolean;
}

interface HelpAnswer {
  id: number;
  answerer: string;
  answererId?: number;
  answererProfileImage?: string;
  content: string;
  timestamp: Date;
  isAccepted?: boolean;
}

const OpenStudyRoomPage: React.FC = () => {
  const { user } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const helpFileInputRef = useRef<HTMLInputElement>(null);
  const hasJoinedRef = useRef(false);
  const isLeavingRef = useRef(false);

  // Room Info
  const [roomInfo, setRoomInfo] = useState<OpenStudyRoom | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // My Status
  const [myStatus, setMyStatus] = useState<"studying" | "resting">("studying");

  // Session - 백엔드 연동
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const intervalRef = useRef<any>(null);
  
  // Level Info
  const [levelInfo, setLevelInfo] = useState<LevelInfoDto | null>(null);

  // Today's Stats
  const [todayStats, setTodayStats] = useState({
    totalStudyTime: 0,
    studySessions: 0,
    restSessions: 0,
  });

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Question mode
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [questionFileName, setQuestionFileName] = useState<string | null>(null);

  // Answer input for specific question
  const [answerInputs, setAnswerInputs] = useState<Record<number, string>>({});

  // Question list popover
  const [questionListOpen, setQuestionListOpen] = useState(false);

  // Dialogs
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // Audio (백색소음 & 분위기 음악 & 자연음악)
  const [audioType, setAudioType] = useState<"none" | "whiteNoise" | "ambient" | "nature">("none");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.5);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const whiteNoiseAudioContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseGainNodeRef = useRef<GainNode | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Pomodoro Timer
  const [pomodoroMode, setPomodoroMode] = useState<"work" | "shortBreak" | "longBreak">("work");
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [pomodoroIsRunning, setPomodoroIsRunning] = useState(false);
  const [pomodoroCycle, setPomodoroCycle] = useState(1);
  const pomodoroIntervalRef = useRef<any>(null);

  // 시간 포맷 함수
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // 상대적 시간 표시
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  };

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 레벨 정보 조회
  useEffect(() => {
    const fetchLevelInfo = async () => {
      try {
        const info = await sessionAPI.getLevelInfo();
        setLevelInfo(info);
      } catch (error) {
        console.error("Failed to fetch level info:", error);
      }
    };

    if (user) {
      fetchLevelInfo();
    }
  }, [user]);

  // 타이머 실시간 UI 업데이트 - myStatus에 따라 작동
  useEffect(() => {
    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // "공부중" 상태일 때만 타이머 시작
    if (myStatus === "studying") {
      intervalRef.current = setInterval(() => {
        setCurrentSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [myStatus]);

  // 오디오 cleanup
  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 오디오 정리
      if (audioType === "whiteNoise") {
        stopWhiteNoise();
      } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioType]);

  // 뽀모도로 타이머
  useEffect(() => {
    if (pomodoroIntervalRef.current) {
      clearInterval(pomodoroIntervalRef.current);
      pomodoroIntervalRef.current = null;
    }

    if (pomodoroIsRunning && pomodoroTime > 0) {
      pomodoroIntervalRef.current = setInterval(() => {
        setPomodoroTime((prev) => {
          if (prev <= 1) {
            setPomodoroIsRunning(false);

            if (pomodoroMode === "work") {
              toast({
                title: "🎉 작업 완료!",
                description: "휴식을 취하세요!",
              });

              if (pomodoroCycle === 4) {
                setPomodoroMode("longBreak");
                setPomodoroTime(15 * 60);
                setPomodoroCycle(1);
              } else {
                setPomodoroMode("shortBreak");
                setPomodoroTime(5 * 60);
                setPomodoroCycle((prev) => prev + 1);
              }
            } else {
              toast({
                title: "휴식 완료",
                description: "다시 공부를 시작하세요!",
              });
              setPomodoroMode("work");
              setPomodoroTime(25 * 60);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (pomodoroIntervalRef.current) {
        clearInterval(pomodoroIntervalRef.current);
        pomodoroIntervalRef.current = null;
      }
    };
  }, [pomodoroIsRunning, pomodoroTime, pomodoroMode, pomodoroCycle]);

  // WebSocket 메시지 수신 처리
  const handleWebSocketMessage = (wsMessage: WebSocketMessage) => {
    console.log("📩 WebSocket message received:", wsMessage);

    const messageId = wsMessage.id || wsMessage.messageId || 0;

    const newMessage: ChatMessage = {
      id: messageId,
      type: wsMessage.type,
      sender: wsMessage.sender,
      senderId: undefined,
      senderProfileImage: undefined,
      content: wsMessage.message,
      imageUrl: wsMessage.imageUrl,
      timestamp: new Date(wsMessage.sentAt),
      refId: wsMessage.refId,
      isSolved: wsMessage.isSolved,
    };

    if (wsMessage.type === "QUESTION") {
      newMessage.status = "open";
      newMessage.answers = [];
      console.log("➕ Adding QUESTION message:", newMessage);
      setMessages((prev) => [...prev, newMessage]);
      
    } else if (wsMessage.type === "ANSWER") {
      console.log("💬 ANSWER received:", {
        id: messageId,
        refId: wsMessage.refId,
        sender: wsMessage.sender,
        message: wsMessage.message,
      });

      if (!wsMessage.refId) {
        console.error("❌ ANSWER has no refId!");
        return;
      }

      setMessages((prev) => {
        const updated = prev.map((msg) => {
          if (msg.id === wsMessage.refId && msg.type === "QUESTION") {
            console.log("✅ Found matching QUESTION:", msg.id);

            const newAnswer: HelpAnswer = {
              id: messageId,
              answerer: wsMessage.sender,
              answererId: undefined,
              answererProfileImage: undefined,
              content: wsMessage.message,
              timestamp: new Date(wsMessage.sentAt),
              isAccepted: false,
            };

            console.log("➕ Adding answer to question:", newAnswer);

            return {
              ...msg,
              answers: [...(msg.answers || []), newAnswer],
              status: "helping" as const,
            };
          }
          return msg;
        });

        console.log("📦 Updated messages:", updated);
        return updated;
      });
      
    } else if (wsMessage.type === "SOLVE") {
      console.log("✅ SOLVE message received:", wsMessage);

      if (wsMessage.refId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === wsMessage.refId && msg.type === "QUESTION") {
              console.log("✅ Marking question as SOLVED:", msg.id);
              return {
                ...msg,
                status: "resolved" as const,
                isSolved: true,
              };
            }
            return msg;
          })
        );
      }
      
      addSystemMessage(wsMessage.message);
      
    } else if (wsMessage.type === "SYSTEM") {
      addSystemMessage(wsMessage.message);
      
    } else {
      console.log("➕ Adding TALK message:", newMessage);
      setMessages((prev) => [...prev, newMessage]);
    }
  };

  // 채팅 내역 불러오기
  const loadChatHistory = async (roomIdNum: number) => {
    try {
      const response = await chatAPI.getChatHistory(roomIdNum, "OPEN", 0);
      
      console.log("📦 Chat history response:", response);
      
      if (!Array.isArray(response)) {
        console.warn("⚠️ Chat history is not an array:", response);
        setMessages([]);
        return;
      }
      
      if (response.length === 0) {
        console.log("✅ No chat history found");
        setMessages([]);
        return;
      }
      
      const loadedMessages: ChatMessage[] = response.map((apiMsg) => {
        const baseMessage: ChatMessage = {
          id: apiMsg.id,
          type: apiMsg.type,
          sender: apiMsg.sender,
          senderId: undefined,
          senderProfileImage: undefined,
          content: apiMsg.message,
          imageUrl: apiMsg.imageUrl,
          timestamp: new Date(apiMsg.sentAt),
          refId: apiMsg.refId,
          isSolved: apiMsg.isSolved,
        };

        if (apiMsg.type === "QUESTION") {
          baseMessage.status = apiMsg.isSolved ? "resolved" : "open";
          baseMessage.answers = [];
        }

        return baseMessage;
      });

      loadedMessages.forEach((msg) => {
        if (msg.type === "ANSWER" && msg.refId) {
          const questionMsg = loadedMessages.find(
            (m) => m.id === msg.refId && m.type === "QUESTION"
          );
          if (questionMsg) {
            const answer: HelpAnswer = {
              id: msg.id,
              answerer: msg.sender,
              answererId: undefined,
              answererProfileImage: undefined,
              content: msg.content,
              timestamp: msg.timestamp,
            };
            if (!questionMsg.answers) questionMsg.answers = [];
            questionMsg.answers.push(answer);
            if (questionMsg.answers.length > 0 && !questionMsg.isSolved) {
              questionMsg.status = "helping";
            }
          }
        }
      });

      const filteredMessages = loadedMessages.filter(
        (msg) => msg.type !== "ANSWER"
      );

      setMessages(filteredMessages);
      console.log("✅ Chat history loaded:", filteredMessages.length, "messages");
    } catch (error) {
      console.error("❌ Failed to load chat history:", error);
      setMessages([]);
    }
  };

  // ✅ 방 입장 로직 개선 - 새로고침 처리 강화
  useEffect(() => {
    if (!user || !roomId || hasJoinedRef.current) return;

    const joinRoom = async () => {
      try {
        setLoading(true);
        console.log("🚪 Attempting to join room:", roomId);

        // 1. 방 정보 조회
        let roomData: OpenStudyRoom;
        try {
          roomData = await openStudyAPI.getRoom(roomId);
          console.log("✅ Room data loaded:", roomData);
          setRoomInfo(roomData);

          // 초기 참여자 목록 설정 (방장만)
          setParticipants([
            {
              id: "creator",
              username: roomData.creatorUsername || "방장",
              status: "studying",
              isCreator: true,
            },
          ]);
        } catch (error: any) {
          console.error("❌ Failed to get room info:", error);
          toast({
            title: "오류",
            description: "방 정보를 불러올 수 없습니다.",
            variant: "destructive",
          });
          navigate("/open-study");
          return;
        }

        // 2. 방장 여부 확인
        const isCreator =
          roomData.creatorUsername === user.username ||
          (roomData.createdBy && roomData.createdBy === user.id);

        console.log("👤 User role:", isCreator ? "방장" : "참여자");

        // 3. 비방장만 입장 API 호출 (방장은 이미 입장되어 있음)
        if (!isCreator) {
          try {
            await openStudyAPI.joinRoom(roomId);
            console.log("✅ Successfully joined room via API");
          } catch (joinError: any) {
            const errorMsg = String(joinError?.message || "");
            console.warn("⚠️ Join room API error:", errorMsg);

            // 이미 참여 중인 경우 (409, "이미", "already" 등)
            const isAlreadyJoinedError =
              errorMsg.includes("409") ||
              errorMsg.includes("이미") ||
              errorMsg.toLowerCase().includes("already");

            if (isAlreadyJoinedError) {
              console.log("ℹ️ Already joined - treating as success (refresh scenario)");
              // 에러를 무시하고 계속 진행 (새로고침 시나리오)
            } else {
              // 진짜 에러 (방이 삭제됨, 정원 초과 등)
              console.error("❌ Real join error:", errorMsg);
              throw joinError;
            }
          }

          // 비방장 자신을 참여자 목록에 추가
          setParticipants((prev) => [
            ...prev,
            {
              id: user.id?.toString() || "me",
              username: user.username,
              status: "studying",
              isCreator: false,
            },
          ]);
        }

        // 4. WebSocket 연결
        const roomIdNum = parseInt(roomId, 10);
        webSocketService.connect(
          () => {
            console.log("🔌 WebSocket connected successfully");
            loadChatHistory(roomIdNum);
            webSocketService.subscribe(roomIdNum, "OPEN", handleWebSocketMessage);
          },
          (error) => {
            console.error("❌ WebSocket connection failed:", error);
            toast({
              title: "연결 오류",
              description: "채팅 서버 연결에 실패했습니다.",
              variant: "destructive",
            });
          }
        );

        // 5. 스터디 세션 시작
        try {
          if (!isNaN(roomIdNum)) {
            console.log("⏱️ Starting session...");
            const sessionResponse = await sessionAPI.startSession({
              studyType: "OPEN_STUDY",
              roomId: roomIdNum,
            });
            console.log("✅ Session started:", sessionResponse);

            setSessionId(sessionResponse.sessionId);
            setIsSessionActive(true);
            setCurrentSeconds(0);
          }
        } catch (sessionError: any) {
          const sessionMsg = String(sessionError?.message || "");
          console.warn("⚠️ Session start error:", sessionMsg);

          // 이미 활성 세션이 있는 경우
          const isActiveSessionError =
            sessionMsg.includes("이미") ||
            sessionMsg.toLowerCase().includes("already active");

          if (isActiveSessionError) {
            console.log("ℹ️ Already has active session - continuing...");
            // 세션 에러를 무시하고 계속 진행
          } else {
            console.warn("⚠️ Session error (non-critical):", sessionError);
            // 세션 시작 실패해도 방 입장은 유지
          }
        }

        // 6. 로컬 저장소에 현재 방 ID 저장
        localStorage.setItem("currentOpenStudyRoom", roomId);
        hasJoinedRef.current = true;

        toast({
          title: "입장 완료",
          description: `${roomData.title}에 입장했습니다.`,
        });

        setLoading(false);
      } catch (error: any) {
        console.error("❌ Failed to join room:", error);

        toast({
          title: "입장 실패",
          description: error?.message || "방 입장에 실패했습니다.",
          variant: "destructive",
        });

        // 실패 시 로컬 저장소 정리
        localStorage.removeItem("currentOpenStudyRoom");
        setLoading(false);
        navigate("/open-study");
      }
    };

    joinRoom();

    // Cleanup: WebSocket 연결 해제
    return () => {
      if (roomId && hasJoinedRef.current) {
        const roomIdNum = parseInt(roomId, 10);
        if (!isNaN(roomIdNum)) {
          webSocketService.unsubscribe(roomIdNum, "OPEN");
        }
        webSocketService.disconnect();
      }
    };
  }, [user, roomId, navigate]);

  // ✅ 수정된 코드 (새로고침 허용)
useEffect(() => {
  const handleBeforeUnload = () => {
    if (!roomId || !hasJoinedRef.current || isLeavingRef.current) return;

    console.log("🔄 Page refresh/close detected");

    // ✅ 새로고침 시에는 서버에 leave 요청 안 함 (방장/비방장 공통)
    // 로컬 저장소만 정리
    localStorage.removeItem("currentOpenStudyRoom");
    
    console.log("✅ Keeping server-side room state for refresh");
  };

  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    
    // ✅ 컴포넌트 언마운트 시 (라우터 이동)에만 실제 퇴장 처리
    if (roomId && hasJoinedRef.current && !isLeavingRef.current) {
      console.log("🚪 Component unmounting (route change) → calling leaveRoom");
      leaveRoom();
    }
  };
}, [roomId]);

  // 방 나가기 함수
  const leaveRoom = async () => {
    if (!roomId || isLeavingRef.current) return;
    
    console.log("🚪 Leaving room:", roomId);
    isLeavingRef.current = true;

    try {
      // 뽀모도로 타이머 정리
      if (pomodoroIntervalRef.current) {
        clearInterval(pomodoroIntervalRef.current);
        pomodoroIntervalRef.current = null;
      }
      setPomodoroIsRunning(false);

      // 오디오 정리
      if (audioType === "whiteNoise") {
        stopWhiteNoise();
      } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setAudioType("none");
      setIsAudioPlaying(false);

      localStorage.removeItem("currentOpenStudyRoom");
      await openStudyAPI.leaveRoom(roomId);
      console.log("✅ Successfully left room");
      hasJoinedRef.current = false;
    } catch (error) {
      console.error("❌ Failed to leave room:", error);
      // 에러가 나도 로컬 상태는 정리
      localStorage.removeItem("currentOpenStudyRoom");
      hasJoinedRef.current = false;
    }
  };

  const handleStatusToggle = (newStatus: "studying" | "resting") => {
    if (myStatus === newStatus) return;

    if (newStatus === "resting" && myStatus === "studying") {
      setTodayStats((prev) => ({
        ...prev,
        studySessions: prev.studySessions + 1,
      }));
      addSystemMessage(
        `${user?.username}님이 휴식 모드로 전환했습니다. (공부 시간: ${formatTime(
          currentSeconds
        )})`
      );
    } else if (newStatus === "studying" && myStatus === "resting") {
      setTodayStats((prev) => ({
        ...prev,
        restSessions: prev.restSessions + 1,
      }));
      addSystemMessage(`${user?.username}님이 공부 모드로 전환했습니다.`);
    }

    setMyStatus(newStatus);
    setParticipants((prev) =>
      prev.map((p) =>
        p.username === user?.username ? { ...p, status: newStatus } : p
      )
    );
  };

  const handleTimerReset = () => {
    setCurrentSeconds(0);
    toast({
      title: "타이머 리셋",
      description: "타이머가 00:00으로 초기화되었습니다.",
    });
  };

  // 메시지 전송 (WebSocket 사용)
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !roomId) return;

    try {
      const roomIdNum = parseInt(roomId, 10);

      if (isQuestionMode) {
        // TODO: 질문 이미지 업로드 연동
        webSocketService.sendMessage({
          type: "QUESTION",
          roomType: "OPEN",
          roomId: roomIdNum,
          message: messageInput,
        });

        setMessageInput("");
        setIsQuestionMode(false);
        setQuestionImage(null);
        setQuestionFileName(null);

        toast({
          title: "질문 등록",
          description: "질문이 등록되었습니다. 다른 참여자들이 답변해줄 거예요!",
        });
      } else {
        webSocketService.sendMessage({
          type: "TALK",
          roomType: "OPEN",
          roomId: roomIdNum,
          message: messageInput,
        });

        setMessageInput("");
      }
    } catch (error: any) {
      console.error("Failed to send message:", error);
      toast({
        title: "전송 실패",
        description: error?.message || "메시지 전송에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const addSystemMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now(),
      type: "SYSTEM",
      sender: "SYSTEM",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "오류",
        description: "이미지 크기는 10MB를 초과할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    if (isQuestionMode) {
      const imageUrl = URL.createObjectURL(file);
      setQuestionImage(imageUrl);
      setQuestionFileName(file.name);
    } else {
      try {
        const imageUrl = await chatAPI.uploadImage(file);
        
        if (roomId) {
          const roomIdNum = parseInt(roomId, 10);
          webSocketService.sendMessage({
            type: "TALK",
            roomType: "OPEN",
            roomId: roomIdNum,
            message: imageUrl,
          });
        }

        toast({
          title: "이미지 전송 완료",
          description: "이미지가 전송되었습니다.",
        });
      } catch (error: any) {
        console.error("Failed to upload image:", error);
        toast({
          title: "업로드 실패",
          description: error?.message || "이미지 업로드에 실패했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "오류",
        description: "파일 크기는 50MB를 초과할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "준비중",
      description: "파일 업로드 기능은 준비중입니다.",
    });
  };

  // 답변 제출 (WebSocket 사용)
  const handleSubmitAnswer = (questionId: number) => {
    console.log("🔍 handleSubmitAnswer called with questionId:", questionId);
    
    const answerText = answerInputs[questionId];
    console.log("🔍 answerText:", answerText);
    
    if (!answerText?.trim() || !roomId) {
      console.log("❌ Validation failed:", { answerText, roomId });
      return;
    }

    try {
      const roomIdNum = parseInt(roomId, 10);

      console.log("📤 Sending ANSWER with refId:", questionId);

      webSocketService.sendMessage({
        type: "ANSWER",
        roomType: "OPEN",
        roomId: roomIdNum,
        message: answerText,
        refId: questionId,
      });

      setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));

      toast({
        title: "답변 등록",
        description: "답변이 등록되었습니다!",
      });
    } catch (error: any) {
      console.error("Failed to submit answer:", error);
      toast({
        title: "전송 실패",
        description: error?.message || "답변 전송에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 답변 채택 (REST API 사용)
  const handleAcceptAnswer = async (questionId: number, answerId: number) => {
    try {
      console.log("👑 Accepting answer:", { questionId, answerId });

      await chatAPI.solveQuestion(questionId, answerId);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === questionId && msg.type === "QUESTION"
            ? {
                ...msg,
                answers: msg.answers?.map((ans) =>
                  ans.id === answerId ? { ...ans, isAccepted: true } : ans
                ),
                status: "resolved" as const,
                isSolved: true,
              }
            : msg
        )
      );

      toast({
        title: "답변 채택 완료",
        description: "답변이 채택되어 질문이 해결되었습니다! 🎉",
      });
    } catch (error: any) {
      console.error("Failed to accept answer:", error);
      toast({
        title: "채택 실패",
        description: error?.message || "답변 채택에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 질문으로 스크롤
  const scrollToQuestion = (questionId: number) => {
    setQuestionListOpen(false);

    setTimeout(() => {
      const element = document.getElementById(`question-${questionId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-4", "ring-red-300", "ring-opacity-50");
        setTimeout(() => {
          element.classList.remove("ring-4", "ring-red-300", "ring-opacity-50");
        }, 2000);
      }
    }, 100);
  };

  // 질문 삭제
  const handleDeleteQuestion = async (questionId: number) => {
    try {
      console.log("🗑️ Deleting question:", questionId);
      
      await chatAPI.deleteMessage(questionId);

      setMessages((prev) => prev.filter((msg) => msg.id !== questionId));

      toast({
        title: "삭제 완료",
        description: "질문이 삭제되었습니다.",
      });
    } catch (error: any) {
      console.error("Failed to delete question:", error);
      toast({
        title: "삭제 실패",
        description: error?.message || "질문 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 백색소음 생성 함수
  const generateWhiteNoise = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        toast({
          title: "지원되지 않음",
          description: "이 브라우저는 오디오를 지원하지 않습니다.",
          variant: "destructive",
        });
        return false;
      }

      const audioContext = new AudioContextClass();
      
      // AudioContext가 suspended 상태일 수 있으므로 resume 시도
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const bufferSize = 4096;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = audioVolume * 0.3; // 백색소음은 조금 낮게

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      whiteNoiseAudioContextRef.current = audioContext;
      whiteNoiseGainNodeRef.current = gainNode;
      whiteNoiseSourceRef.current = source;

      source.start(0);
      return true;
    } catch (error) {
      console.error("Failed to generate white noise:", error);
      toast({
        title: "백색소음 재생 실패",
        description: "백색소음을 재생할 수 없습니다. 브라우저를 확인해주세요.",
        variant: "destructive",
      });
      return false;
    }
  };

  // 백색소음 정지
  const stopWhiteNoise = () => {
    try {
      if (whiteNoiseSourceRef.current) {
        whiteNoiseSourceRef.current.stop();
        whiteNoiseSourceRef.current = null;
      }
      if (whiteNoiseAudioContextRef.current) {
        whiteNoiseAudioContextRef.current.close();
        whiteNoiseAudioContextRef.current = null;
      }
      whiteNoiseGainNodeRef.current = null;
    } catch (error) {
      console.error("Failed to stop white noise:", error);
    }
  };

  // 오디오 재생/정지
  const toggleAudio = () => {
    if (audioType === "none") {
      setAudioDialogOpen(true);
      return;
    }

    if (isAudioPlaying) {
      // 정지
      if (audioType === "whiteNoise") {
        stopWhiteNoise();
      } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
        audioRef.current.pause();
      }
      setIsAudioPlaying(false);
    } else {
      // 재생
      if (audioType === "whiteNoise") {
        if (generateWhiteNoise()) {
          setIsAudioPlaying(true);
        }
      } else if (audioType === "ambient" || audioType === "nature") {
        if (audioRef.current) {
          audioRef.current.play().catch((error) => {
            console.error("Failed to play audio:", error);
            toast({
              title: "재생 실패",
              description: "음악을 재생할 수 없습니다.",
              variant: "destructive",
            });
          });
          setIsAudioPlaying(true);
        }
      }
    }
  };

  // 오디오 타입 변경
  const changeAudioType = (type: "none" | "whiteNoise" | "ambient" | "nature") => {
    // 기존 오디오 정지
    if (isAudioPlaying) {
      if (audioType === "whiteNoise") {
        stopWhiteNoise();
      } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
        audioRef.current.pause();
      }
      setIsAudioPlaying(false);
    }

    setAudioType(type);

    if (type === "none") {
      return;
    }

    // 새 오디오 시작
    if (type === "whiteNoise") {
      if (generateWhiteNoise()) {
        setIsAudioPlaying(true);
      }
    } else if (type === "ambient") {
      // 분위기 음악 URL - 원하는 음악 URL로 변경 가능
      const ambientMusicUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
      
      if (!audioRef.current) {
        audioRef.current = new Audio(ambientMusicUrl);
        audioRef.current.loop = true;
        audioRef.current.volume = audioVolume;
        audioRef.current.addEventListener("ended", () => {
          setIsAudioPlaying(false);
        });
        audioRef.current.addEventListener("error", (e) => {
          console.error("Audio error:", e);
          toast({
            title: "음악 재생 실패",
            description: "음악 파일을 불러올 수 없습니다. 인터넷 연결을 확인해주세요.",
            variant: "destructive",
          });
          setIsAudioPlaying(false);
          setAudioType("none");
        });
      } else {
        audioRef.current.src = ambientMusicUrl;
        audioRef.current.volume = audioVolume;
      }
      
      audioRef.current.play().catch((error) => {
        console.error("Failed to play ambient music:", error);
        toast({
          title: "재생 실패",
          description: "음악을 재생할 수 없습니다. 브라우저 설정을 확인해주세요.",
          variant: "destructive",
        });
        setIsAudioPlaying(false);
        setAudioType("none");
      });
      setIsAudioPlaying(true);
    } else if (type === "nature") {
      // 자연음악 URL - 원하는 자연음 URL로 변경 가능
      const natureSoundUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3";
      
      if (!audioRef.current) {
        audioRef.current = new Audio(natureSoundUrl);
        audioRef.current.loop = true;
        audioRef.current.volume = audioVolume;
        audioRef.current.addEventListener("ended", () => {
          setIsAudioPlaying(false);
        });
        audioRef.current.addEventListener("error", (e) => {
          console.error("Audio error:", e);
          toast({
            title: "자연음 재생 실패",
            description: "자연음 파일을 불러올 수 없습니다. 인터넷 연결을 확인해주세요.",
            variant: "destructive",
          });
          setIsAudioPlaying(false);
          setAudioType("none");
        });
      } else {
        audioRef.current.src = natureSoundUrl;
        audioRef.current.volume = audioVolume;
      }
      
      audioRef.current.play().catch((error) => {
        console.error("Failed to play nature sound:", error);
        toast({
          title: "재생 실패",
          description: "자연음을 재생할 수 없습니다. 브라우저 설정을 확인해주세요.",
          variant: "destructive",
        });
        setIsAudioPlaying(false);
        setAudioType("none");
      });
      setIsAudioPlaying(true);
    }
  };

  // 볼륨 변경
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0] / 100;
    setAudioVolume(newVolume);

    if (audioType === "whiteNoise" && whiteNoiseGainNodeRef.current) {
      whiteNoiseGainNodeRef.current.gain.value = newVolume * 0.3;
    } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // 뽀모도로 타이머 핸들러
  const handlePomodoroStart = () => {
    setPomodoroIsRunning(true);
  };

  const handlePomodoroPause = () => {
    setPomodoroIsRunning(false);
  };

  const handlePomodoroReset = () => {
    setPomodoroIsRunning(false);
    if (pomodoroMode === "work") {
      setPomodoroTime(25 * 60);
    } else if (pomodoroMode === "shortBreak") {
      setPomodoroTime(5 * 60);
    } else {
      setPomodoroTime(15 * 60);
    }
    toast({
      title: "뽀모도로 리셋",
      description: "타이머가 초기화되었습니다.",
    });
  };

  const handlePomodoroModeChange = (mode: "work" | "shortBreak" | "longBreak") => {
    setPomodoroIsRunning(false);
    setPomodoroMode(mode);
    if (mode === "work") {
      setPomodoroTime(25 * 60);
    } else if (mode === "shortBreak") {
      setPomodoroTime(5 * 60);
    } else {
      setPomodoroTime(15 * 60);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/#/open-study/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "초대 링크 복사 완료",
      description: "초대 링크가 클립보드에 복사되었습니다.",
    });
  };

  const handleExitRoom = async () => {
    if (!roomId || !roomInfo) return;

    const isCreator =
      user &&
      (roomInfo.createdBy === user.id ||
        roomInfo.creatorUsername === user.username);

    if (isCreator) {
      const confirmDelete = confirm(
        "방장이 나가면 방이 삭제됩니다.\n정말로 방을 나가시겠습니까?"
      );

      if (!confirmDelete) {
        setExitDialogOpen(false);
        return;
      }
    }

    // 스터디 세션 종료
    if (sessionId !== null) {
      try {
        const endResult = await sessionAPI.endSession(sessionId);
        console.log("Session ended successfully:", endResult);

        if (endResult.leveledUp && endResult.newLevel !== null) {
          toast({
            title: "🎉 레벨업!",
            description: `축하합니다! 레벨 ${endResult.newLevel}이 되었습니다!`,
          });
        }

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (pomodoroIntervalRef.current) {
          clearInterval(pomodoroIntervalRef.current);
          pomodoroIntervalRef.current = null;
        }
        setCurrentSeconds(0);
        setSessionId(null);
        setIsSessionActive(false);
        setPomodoroIsRunning(false);
      } catch (sessionError: any) {
        console.error("Failed to end session:", sessionError);
      }
    }

    // 오디오 정리
    if (audioType === "whiteNoise") {
      stopWhiteNoise();
    } else if ((audioType === "ambient" || audioType === "nature") && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioType("none");
    setIsAudioPlaying(false);

    // WebSocket 연결 해제
    if (roomId) {
      const roomIdNum = parseInt(roomId, 10);
      if (!isNaN(roomIdNum)) {
        webSocketService.unsubscribe(roomIdNum, "OPEN");
      }
    }
    webSocketService.disconnect();

    await leaveRoom();
    toast({
      title: isCreator ? "방 삭제 완료" : "방 나가기 완료",
      description: isCreator
        ? "스터디 방이 삭제되었습니다."
        : "스터디룸에서 나왔습니다.",
    });

    setExitDialogOpen(false);
    navigate("/open-study");
  };

  if (loading || !roomInfo) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">스터디룸에 입장하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">{roomInfo.title}</h1>
          <Badge variant="secondary">{roomInfo.studyField}</Badge>

          {/* 참여자 수 팝오버 */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                <Users className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {participants.length}/{roomInfo.maxParticipants}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-900">
                  👥 참여자 목록
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className={`flex items-center space-x-3 p-2 rounded-lg ${
                        participant.isCreator
                          ? "bg-yellow-50 border border-yellow-200"
                          : participant.username === user?.username
                          ? "bg-indigo-50 border border-indigo-200"
                          : "bg-gray-50"
                      }`}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarFallback
                          className={
                            participant.isCreator
                              ? "bg-yellow-500 text-white"
                              : participant.username === user?.username
                              ? "bg-indigo-500 text-white"
                              : "bg-gray-400 text-white"
                          }
                        >
                          {participant.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {participant.username}
                          </span>
                          {participant.isCreator && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-yellow-100"
                            >
                              방장
                            </Badge>
                          )}
                          {participant.username === user?.username &&
                            !participant.isCreator && (
                              <Badge variant="secondary" className="text-xs">
                                나
                              </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              participant.status === "studying"
                                ? "bg-green-500"
                                : "bg-orange-500"
                            }`}
                          ></span>
                          <span className="text-xs text-gray-500">
                            {participant.status === "studying"
                              ? "공부중"
                              : "휴식중"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInviteDialogOpen(true)}
          >
            <Users className="w-4 h-4 mr-2" />
            초대
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExitDialogOpen(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            나가기
          </Button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 채팅 */}
        <div className="flex-1 flex flex-col">
          {/* 상태 전환 + 타이머 */}
          <div className="border-b bg-white p-4">
            <div className="flex items-center gap-4">
              <Button
                variant={myStatus === "studying" ? "default" : "outline"}
                className={
                  myStatus === "studying"
                    ? "bg-green-500 hover:bg-green-600"
                    : ""
                }
                onClick={() => handleStatusToggle("studying")}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                공부중
              </Button>
              <Button
                variant={myStatus === "resting" ? "default" : "outline"}
                className={
                  myStatus === "resting"
                    ? "bg-orange-500 hover:bg-orange-600"
                    : ""
                }
                onClick={() => handleStatusToggle("resting")}
              >
                <Coffee className="w-4 h-4 mr-2" />
                휴식중
              </Button>

              <div className="flex items-center gap-3 ml-4 px-4 py-2 bg-gray-100 rounded-lg">
                <Clock className="w-5 h-5 text-gray-600" />
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      myStatus === "studying"
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    {formatTime(currentSeconds)}
                  </span>
                  {myStatus === "studying" ? (
                    <span className="flex items-center text-xs text-green-600">
                      <Play className="w-3 h-3 mr-1" />
                      진행중
                    </span>
                  ) : (
                    <span className="flex items-center text-xs text-orange-500">
                      <Pause className="w-3 h-3 mr-1" />
                      일시정지
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTimerReset}
                  className="text-gray-500 hover:text-gray-700"
                >
                  리셋
                </Button>
              </div>

              {/* 뽀모도로 타이머 */}
              <div className="flex items-center gap-5 ml-4 px-5 py-3 bg-white rounded-xl border border-red-100 shadow-md hover:shadow-lg transition-all duration-200">
                <div className="flex flex-col items-center">
                  <span className="text-base font-semibold text-red-600 whitespace-nowrap tracking-wide uppercase">Pomodoro</span>
                  <span className="text-xs text-gray-500 font-normal">뽀모도로</span>
                </div>
                
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-red-200 to-transparent"></div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-mono font-semibold tabular-nums ${
                    pomodoroIsRunning
                      ? pomodoroMode === "work" ? "text-red-600" : "text-blue-500"
                      : "text-gray-400"
                  }`}>
                    {formatTime(pomodoroTime)}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs font-medium px-2.5 py-1 whitespace-nowrap ${
                      pomodoroMode === "work" 
                        ? "bg-red-100 text-red-700 border border-red-200" 
                        : pomodoroMode === "shortBreak"
                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                        : "bg-green-100 text-green-700 border border-green-200"
                    }`}
                  >
                    {pomodoroMode === "work" ? "작업" : pomodoroMode === "shortBreak" ? "짧은 휴식" : "긴 휴식"}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium px-2.5 py-1 border-gray-300 text-gray-600 bg-gray-50">
                    {pomodoroCycle}/4
                  </Badge>
                </div>
                
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
                
                <div className="flex items-center gap-1.5">
                  {pomodoroIsRunning ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePomodoroPause}
                      className="h-9 w-9 p-0 rounded-lg hover:bg-red-50 transition-colors"
                      title="일시정지"
                    >
                      <Pause className="w-4 h-4 text-red-600" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePomodoroStart}
                      className="h-9 w-9 p-0 rounded-lg hover:bg-red-50 transition-colors"
                      title="시작"
                    >
                      <Play className="w-4 h-4 text-red-600" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePomodoroReset}
                    className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    title="리셋"
                  >
                    <Clock className="w-4 h-4" />
                  </Button>
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap transition-colors"
                    >
                      모드 변경
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 shadow-xl border-gray-200">
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-gray-600 mb-3 px-1">Pomodoro Mode</div>
                      <Button
                        variant={pomodoroMode === "work" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "work"
                            ? "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("work")}
                      >
                        <span className="mr-2">📚</span>
                        작업 (25분)
                      </Button>
                      <Button
                        variant={pomodoroMode === "shortBreak" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "shortBreak"
                            ? "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("shortBreak")}
                      >
                        <span className="mr-2">☕</span>
                        짧은 휴식 (5분)
                      </Button>
                      <Button
                        variant={pomodoroMode === "longBreak" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "longBreak"
                            ? "bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("longBreak")}
                      >
                        <span className="mr-2">🌴</span>
                        긴 휴식 (15분)
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* 음악 플레이어 */}
              <Popover open={audioDialogOpen} onOpenChange={setAudioDialogOpen}>
                <PopoverTrigger asChild>
                  <div className={`group relative ml-4 px-4 py-2.5 bg-white rounded-2xl border-2 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden ${
                    isAudioPlaying 
                      ? audioType === "whiteNoise" 
                        ? "border-purple-300 bg-gradient-to-br from-purple-50 via-purple-50/80 to-white" 
                        : audioType === "ambient"
                        ? "border-blue-300 bg-gradient-to-br from-blue-50 via-blue-50/80 to-white"
                        : audioType === "nature"
                        ? "border-green-300 bg-gradient-to-br from-green-50 via-green-50/80 to-white"
                        : "border-gray-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}>
                    {/* 배경 효과 */}
                    {isAudioPlaying && (
                      <div className={`absolute inset-0 opacity-5 ${
                        audioType === "whiteNoise" ? "bg-purple-400" 
                        : audioType === "ambient" ? "bg-blue-400"
                        : audioType === "nature" ? "bg-green-400"
                        : ""
                      }`}></div>
                    )}
                    
                    <div className="relative flex items-center gap-3">
                      {/* 음악 아이콘 */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${
                        isAudioPlaying 
                          ? audioType === "whiteNoise" 
                            ? "bg-purple-100 text-purple-600 shadow-sm" 
                            : audioType === "ambient"
                            ? "bg-blue-100 text-blue-600 shadow-sm"
                            : audioType === "nature"
                            ? "bg-green-100 text-green-600 shadow-sm"
                            : "bg-gray-100 text-gray-400"
                          : "bg-gray-50 text-gray-400 group-hover:bg-gray-100"
                      }`}>
                        <Music className="w-5 h-5" />
                      </div>
                      
                      {/* 상태 정보 */}
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-medium mb-0.5 ${
                          isAudioPlaying 
                            ? audioType === "whiteNoise" ? "text-purple-600" 
                            : audioType === "ambient" ? "text-blue-600"
                            : audioType === "nature" ? "text-green-600"
                            : "text-gray-500"
                            : "text-gray-500"
                        }`}>
                          {isAudioPlaying ? "재생 중" : "음악"}
                        </span>
                        <span className={`text-sm font-bold truncate ${
                          isAudioPlaying
                            ? audioType === "whiteNoise" ? "text-purple-700"
                            : audioType === "ambient" ? "text-blue-700"
                            : audioType === "nature" ? "text-green-700"
                            : "text-gray-600"
                            : "text-gray-400"
                        }`}>
                          {audioType === "whiteNoise" ? "백색소음" : audioType === "ambient" ? "분위기 음악" : audioType === "nature" ? "자연음악" : "OFF"}
                        </span>
                      </div>
                      
                      {/* 재생/일시정지 버튼 */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        {isAudioPlaying ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAudio();
                            }}
                            className={`h-8 w-8 p-0 rounded-lg transition-all duration-200 ${
                              audioType === "whiteNoise" 
                                ? "hover:bg-purple-100 text-purple-600 hover:scale-110" 
                                : audioType === "ambient"
                                ? "hover:bg-blue-100 text-blue-600 hover:scale-110"
                                : audioType === "nature"
                                ? "hover:bg-green-100 text-green-600 hover:scale-110"
                                : "hover:bg-gray-100 text-gray-500"
                            }`}
                            title="일시정지"
                          >
                            <Pause className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAudio();
                            }}
                            className="h-8 w-8 p-0 rounded-lg hover:bg-gray-100 text-gray-500 hover:scale-110 transition-all duration-200"
                            title="재생"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* 선택 버튼 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAudioDialogOpen(true);
                          }}
                          className={`h-8 px-3 text-xs rounded-lg transition-all duration-200 ${
                            isAudioPlaying
                              ? audioType === "whiteNoise"
                                ? "hover:bg-purple-100 text-purple-700 border border-purple-200"
                                : audioType === "ambient"
                                ? "hover:bg-blue-100 text-blue-700 border border-blue-200"
                                : audioType === "nature"
                                ? "hover:bg-green-100 text-green-700 border border-green-200"
                                : "hover:bg-gray-100 text-gray-700 border border-gray-200"
                              : "hover:bg-gray-100 text-gray-700 border border-gray-200"
                          }`}
                        >
                          선택
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-5 shadow-2xl border-gray-200/50 backdrop-blur-sm bg-white/95" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-5">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h4 className="font-bold text-base text-gray-900 flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          isAudioPlaying 
                            ? audioType === "whiteNoise" ? "bg-purple-100 text-purple-600" 
                            : audioType === "ambient" ? "bg-blue-100 text-blue-600"
                            : audioType === "nature" ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-500"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          <Music className="w-4 h-4" />
                        </div>
                        <span>음악 선택</span>
                      </h4>
                      {isAudioPlaying && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleAudio}
                          className={`h-8 w-8 p-0 rounded-lg transition-all ${
                            audioType === "whiteNoise" ? "hover:bg-purple-100 text-purple-600" 
                            : audioType === "ambient" ? "hover:bg-blue-100 text-blue-600"
                            : audioType === "nature" ? "hover:bg-green-100 text-green-600"
                            : "hover:bg-gray-100 text-gray-500"
                          }`}
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    {/* 음악 타입 선택 */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant={audioType === "whiteNoise" ? "default" : "outline"}
                        size="sm"
                        className={`h-auto py-4 flex-col gap-2.5 transition-all duration-200 ${
                          audioType === "whiteNoise" 
                            ? "bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-150 text-purple-700 border-2 border-purple-300 shadow-sm" 
                            : "hover:border-purple-200 hover:bg-purple-50/50"
                        }`}
                        onClick={() => {
                          changeAudioType("whiteNoise");
                          setAudioDialogOpen(false);
                        }}
                      >
                        <span className="text-3xl">🔊</span>
                        <span className="text-xs font-semibold">백색소음</span>
                      </Button>
                      <Button
                        variant={audioType === "ambient" ? "default" : "outline"}
                        size="sm"
                        className={`h-auto py-4 flex-col gap-2.5 transition-all duration-200 ${
                          audioType === "ambient" 
                            ? "bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-150 text-blue-700 border-2 border-blue-300 shadow-sm" 
                            : "hover:border-blue-200 hover:bg-blue-50/50"
                        }`}
                        onClick={() => {
                          changeAudioType("ambient");
                          setAudioDialogOpen(false);
                        }}
                      >
                        <span className="text-3xl">🎵</span>
                        <span className="text-xs font-semibold">분위기 음악</span>
                      </Button>
                      <Button
                        variant={audioType === "nature" ? "default" : "outline"}
                        size="sm"
                        className={`h-auto py-4 flex-col gap-2.5 transition-all duration-200 ${
                          audioType === "nature" 
                            ? "bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-150 text-green-700 border-2 border-green-300 shadow-sm" 
                            : "hover:border-green-200 hover:bg-green-50/50"
                        }`}
                        onClick={() => {
                          changeAudioType("nature");
                          setAudioDialogOpen(false);
                        }}
                      >
                        <span className="text-3xl">🌿</span>
                        <span className="text-xs font-semibold">자연음악</span>
                      </Button>
                      <Button
                        variant={audioType === "none" ? "default" : "outline"}
                        size="sm"
                        className={`h-auto py-4 flex-col gap-2.5 transition-all duration-200 ${
                          audioType === "none"
                            ? "bg-gray-100 border-2 border-gray-300"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          changeAudioType("none");
                          setAudioDialogOpen(false);
                        }}
                      >
                        <span className="text-3xl">🔇</span>
                        <span className="text-xs font-semibold">끄기</span>
                      </Button>
                    </div>

                    {/* 볼륨 조절 */}
                    {audioType !== "none" && (
                      <div className="space-y-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold flex items-center gap-2 ${
                            audioType === "whiteNoise" ? "text-purple-700" 
                            : audioType === "ambient" ? "text-blue-700"
                            : audioType === "nature" ? "text-green-700"
                            : "text-gray-700"
                          }`}>
                            {audioVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            볼륨
                          </span>
                          <span className={`text-sm font-bold ${
                            audioType === "whiteNoise" ? "text-purple-600" 
                            : audioType === "ambient" ? "text-blue-600"
                            : audioType === "nature" ? "text-green-600"
                            : "text-gray-600"
                          }`}>
                            {Math.round(audioVolume * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[audioVolume * 100]}
                          onValueChange={handleVolumeChange}
                          max={100}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
                {levelInfo && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-sky-50 rounded-lg border border-indigo-200">
                    <span className="font-semibold text-indigo-700">
                      레벨 {levelInfo.currentLevel}
                    </span>
                    <span className="text-xs text-gray-600">
                      ({Math.round(levelInfo.progress)}%)
                    </span>
                  </div>
                )}
                {messages.filter(m => m.type === "QUESTION" && m.status !== "resolved").length > 0 && (
                  <Popover open={questionListOpen} onOpenChange={setQuestionListOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200 hover:shadow-md transition-all cursor-pointer">
                        <HelpCircle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-700">
                          질문 {messages.filter(m => m.type === "QUESTION" && m.status !== "resolved").length}개
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-4 max-h-[500px] overflow-y-auto">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-red-500" />
                          미해결 질문 목록
                        </h4>
                        <div className="space-y-2">
                          {messages
                            .filter(m => m.type === "QUESTION" && m.status !== "resolved")
                            .map((question) => (
                              <div
                                key={question.id}
                                className="p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 cursor-pointer transition-colors"
                                onClick={() => scrollToQuestion(question.id)}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarFallback className="bg-red-500 text-white text-xs">
                                        {question.sender?.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-sm">
                                      {question.sender}
                                    </span>
                                  </div>
                                  <Badge
                                    variant={question.status === "helping" ? "default" : "destructive"}
                                    className="text-xs"
                                  >
                                    {question.status === "helping" ? "답변 중" : "도움 필요"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-800 line-clamp-2 mb-1">
                                  "{question.content}"
                                </p>
                                {question.answers && question.answers.length > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-blue-600">
                                    <MessageCircle className="w-3 h-3" />
                                    <span>답변 {question.answers.length}개</span>
                                  </div>
                                )}
                                <span className="text-xs text-gray-500">
                                  {formatRelativeTime(question.timestamp)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span>총 {formatTime(todayStats.totalStudyTime)}</span>
                </div>
                <div>공부 {todayStats.studySessions}회</div>
                <div>휴식 {todayStats.restSessions}회</div>
              </div>
            </div>
          </div>

          {/* 채팅 메시지 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <p>아직 메시지가 없습니다.</p>
                <p className="text-sm">첫 번째 메시지를 보내보세요!</p>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id}>
                {message.type === "SYSTEM" ? (
                  <div className="text-center text-sm text-gray-500 py-2">
                    {message.content}
                  </div>
                ) : message.type === "QUESTION" ? (
                  <div 
                    id={`question-${message.id}`}
                    className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500 space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <Avatar className="w-8 h-8">
                          {message.senderProfileImage ? (
                            <AvatarImage src={message.senderProfileImage} />
                          ) : null}
                          <AvatarFallback className="bg-red-500 text-white">
                            {message.sender?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {message.sender}
                            </span>
                            <Badge
                              variant={
                                message.status === "resolved"
                                  ? "secondary"
                                  : message.status === "helping"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {message.status === "resolved"
                                ? "해결됨 ✓"
                                : message.status === "helping"
                                ? "답변 중"
                                : "도움 필요"}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(message.timestamp)}
                          </span>
                        </div>
                      </div>
                      {message.sender === user?.username && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteQuestion(message.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <HelpCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-gray-900 flex-1">{message.content}</p>
                      </div>
                    </div>

                    {message.imageUrl && (
                      <div className="bg-white rounded-lg p-2">
                        <img
                          src={message.imageUrl}
                          alt="질문 첨부"
                          className="max-w-sm rounded cursor-pointer hover:opacity-90"
                          onClick={() => window.open(message.imageUrl)}
                        />
                      </div>
                    )}

                    {message.status === "resolved" && message.answers && message.answers.some(ans => ans.isAccepted) && (
                      <div className="pl-7 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                          <CheckCircle className="w-4 h-4" />
                          <span>채택된 답변</span>
                        </div>
                        {message.answers.filter(ans => ans.isAccepted).map((answer) => (
                          <div
                            key={answer.id}
                            className="bg-green-50 rounded-lg p-3 border-2 border-green-300 shadow-sm"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Avatar className="w-6 h-6">
                                {answer.answererProfileImage ? (
                                  <AvatarImage src={answer.answererProfileImage} />
                                ) : null}
                                <AvatarFallback className="bg-green-500 text-white text-xs">
                                  {answer.answerer.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">
                                {answer.answerer}
                              </span>
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                채택됨 ✓
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {formatRelativeTime(answer.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-800 pl-8">
                              {answer.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {message.status !== "resolved" && message.answers && message.answers.length > 0 && (
                      <div className="space-y-2 pl-7">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <MessageCircle className="w-4 h-4" />
                          <span>답변 {message.answers.length}개</span>
                        </div>
                        {message.answers.map((answer) => (
                          <div
                            key={answer.id}
                            className="bg-blue-50 rounded-lg p-3 border border-blue-200"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  {answer.answererProfileImage ? (
                                    <AvatarImage src={answer.answererProfileImage} />
                                  ) : null}
                                  <AvatarFallback className="bg-blue-500 text-white text-xs">
                                    {answer.answerer.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-sm">
                                  {answer.answerer}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatRelativeTime(answer.timestamp)}
                                </span>
                              </div>
                              {message.sender === user?.username && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleAcceptAnswer(message.id, answer.id)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  채택
                                </Button>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 pl-8">
                              {answer.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {message.status !== "resolved" && (
                      <div className="pl-7 flex gap-2">
                        <Input
                          placeholder="답변을 입력하세요..."
                          value={answerInputs[message.id] || ""}
                          onChange={(e) =>
                            setAnswerInputs((prev) => ({
                              ...prev,
                              [message.id]: e.target.value,
                            }))
                          }
                          onKeyPress={(e) =>
                            e.key === "Enter" && handleSubmitAnswer(message.id)
                          }
                          className="flex-1 bg-white"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSubmitAnswer(message.id)}
                          disabled={!answerInputs[message.id]?.trim()}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-8 h-8">
                      {message.senderProfileImage ? (
                        <AvatarImage src={message.senderProfileImage} />
                      ) : null}
                      <AvatarFallback>
                        {message.sender?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm">
                          {message.sender}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(message.timestamp)}
                        </span>
                      </div>

                      <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
                        {message.imageUrl ? (
                          <img
                            src={message.imageUrl}
                            alt="uploaded"
                            className="max-w-xs rounded cursor-pointer hover:opacity-90"
                            onClick={() => window.open(message.imageUrl)}
                          />
                        ) : (
                          <p className="text-gray-900">{message.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 채팅 입력 */}
          <div className="border-t bg-white p-4">
            {isQuestionMode && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-700">
                    질문 모드
                  </span>
                  {questionImage && (
                    <Badge variant="secondary" className="text-xs">
                      이미지 첨부됨
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsQuestionMode(false);
                    setQuestionImage(null);
                    setQuestionFileName(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isQuestionMode}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                id="image-upload"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById("image-upload")?.click()}
              >
                <ImageIcon className="w-5 h-5" />
              </Button>
              <Button
                variant={isQuestionMode ? "default" : "ghost"}
                size="sm"
                className={isQuestionMode ? "bg-red-500 hover:bg-red-600" : ""}
                onClick={() => setIsQuestionMode(!isQuestionMode)}
              >
                <HelpCircle className="w-5 h-5" />
              </Button>
              <Input
                placeholder={
                  isQuestionMode
                    ? "질문 내용을 입력하세요..."
                    : "메시지를 입력하세요..."
                }
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1"
              />
              <Button onClick={handleSendMessage}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 초대 다이얼로그 */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 친구 초대하기</DialogTitle>
            <DialogDescription>
              친구들을 초대하여 함께 공부하세요!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2">초대 링크</Label>
              <div className="flex space-x-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/#/open-study/room/${roomId}`}
                  className="flex-1"
                />
                <Button onClick={handleCopyInviteLink}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 나가기 다이얼로그 */}
      <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스터디룸 나가기</DialogTitle>
            <DialogDescription>
              {user &&
              (roomInfo.createdBy === user.id ||
                roomInfo.creatorUsername === user.username)
                ? "방장이 나가면 방이 삭제됩니다. 정말로 나가시겠습니까?"
                : "정말로 스터디룸을 나가시겠습니까?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setExitDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleExitRoom}>
              나가기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OpenStudyRoomPage;