import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  studyRoomAPI,
  timerAPI,
  sessionAPI,
  GroupStudyRoom,
  TimerStatusResponse,
  TimerStatus,
  TimerMode,
  LevelInfoDto,
  SessionStartRequestDto,
  SessionEndResultDto,
} from "@/lib/api";
import {
  Clock,
  Send,
  LogOut,
  Play,
  Pause,
  BookOpen,
  Coffee,
  TrendingUp,
  HelpCircle,
  MessageCircle,
  CheckCircle,
  X,
  AlertCircle,
  Paperclip,
  Image as ImageIcon,
  Users,
  Edit2,
  Check,
  Copy,
} from "lucide-react";

interface HelpAnswer {
  id: string;
  answerer: string;
  content: string;
  timestamp: Date;
  isAccepted?: boolean;
}

interface ChatMessage {
  id: string;
  type: "text" | "system" | "question";
  sender?: string;
  content: string;
  timestamp: Date;
  answers?: HelpAnswer[];
  status?: "open" | "helping" | "resolved";
  imageUrl?: string;
  fileName?: string;
}

// 참여자 정보 인터페이스 (UI용 더미 데이터)
interface Participant {
  id: number;
  username: string;
  profileImageUrl?: string;
  timerStatus: "STUDYING" | "RESTING";
  statusMessage?: string;
  isCreator?: boolean;
}

const GroupStudyRoomPage: React.FC = () => {
  const { user } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasJoinedRef = useRef(false);
  const isLeavingRef = useRef(false);

  // Room Info
  const [roomInfo, setRoomInfo] = useState<GroupStudyRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ✅ 타이머 상태 (백엔드 연동) - 기존 timerAPI용 (필요시 유지)
  const [timerStatus, setTimerStatus] = useState<TimerStatusResponse | null>(
    null
  );

  // Level Info
  const [levelInfo, setLevelInfo] = useState<LevelInfoDto | null>(null);

  // Pomodoro Timer
  const [pomodoroMode, setPomodoroMode] = useState<"work" | "shortBreak" | "longBreak">("work");
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60); // 25분 (초 단위)
  const [pomodoroIsRunning, setPomodoroIsRunning] = useState(false);
  const [pomodoroCycle, setPomodoroCycle] = useState(1); // 1-4 사이클
  const pomodoroIntervalRef = useRef<any>(null);

  // Participants (UI용 더미 데이터)
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 1,
      username: "다영",
      timerStatus: "STUDYING",
      statusMessage: "열심히 공부 중입니다! 💪",
      isCreator: true,
    },
    {
      id: 2,
      username: user?.username || "사용자",
      timerStatus: "STUDYING",
      statusMessage: "오늘도 화이팅!",
    },
  ]);

  // 상태 메시지 편집 관련
  const [isEditingStatusMessage, setIsEditingStatusMessage] = useState(false);
  const [statusMessageInput, setStatusMessageInput] = useState("");

  // Question mode
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [questionFileName, setQuestionFileName] = useState<string | null>(null);

  // Answer input for specific question
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});

  // Question list popover
  const [questionListOpen, setQuestionListOpen] = useState(false);

  // Dialogs
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // 상태 메시지 저장
  const handleSaveStatusMessage = () => {
    if (statusMessageInput.length > 50) {
      toast({
        title: "오류",
        description: "상태 메시지는 50자 이내로 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    // 본인 참여자의 상태 메시지 업데이트
    setParticipants((prev) =>
      prev.map((p) =>
        p.username === user?.username
          ? { ...p, statusMessage: statusMessageInput.trim() || undefined }
          : p
      )
    );

    setIsEditingStatusMessage(false);
    toast({
      title: "상태 메시지 업데이트",
      description: "상태 메시지가 변경되었습니다.",
    });
  };

  // 상태 메시지 편집 시작
  const handleStartEditStatusMessage = () => {
    const currentUser = participants.find((p) => p.username === user?.username);
    setStatusMessageInput(currentUser?.statusMessage || "");
    setIsEditingStatusMessage(true);
  };

  // 상태 메시지 편집 취소
  const handleCancelEditStatusMessage = () => {
    setIsEditingStatusMessage(false);
    setStatusMessageInput("");
  };

  // 시간 포맷 함수
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  };

  // 초대 링크 복사
  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/#/group-study/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "초대 링크 복사 완료",
      description: "초대 링크가 클립보드에 복사되었습니다.",
    });
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

    // ✅ "공부중" 상태일 때만 타이머 시작
    if (myStatus === "studying") {
      // ✅ 함수형 업데이트를 사용하여 항상 최신 상태를 참조
      intervalRef.current = setInterval(() => {
        setCurrentSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    }

    // 메모리 누수 방지를 위한 클린업
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [myStatus]);

  // 뽀모도로 타이머 로직
  useEffect(() => {
    if (pomodoroIntervalRef.current) {
      clearInterval(pomodoroIntervalRef.current);
      pomodoroIntervalRef.current = null;
    }

    if (pomodoroIsRunning && pomodoroTime > 0) {
      pomodoroIntervalRef.current = setInterval(() => {
        setPomodoroTime((prev) => {
          if (prev <= 1) {
            // 시간 종료 - 다음 사이클로 전환
            setPomodoroIsRunning(false);
            
            if (pomodoroMode === "work") {
              // 작업 완료
              toast({
                title: "🎉 작업 완료!",
                description: "휴식을 취하세요!",
              });
              
              // 4번째 사이클이면 긴 휴식, 아니면 짧은 휴식
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
              // 휴식 완료
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

  // ✅ 타이머 상태 폴링 (1초마다) - 기존 timerAPI용 (필요시 유지)
  useEffect(() => {
    if (!user || !roomId || !hasJoinedRef.current) return;

    const interval = setInterval(async () => {
      try {
        const status = await timerAPI.getTimerStatus();
        setTimerStatus(status);
      } catch (error) {
        console.error("타이머 상태 조회 실패:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, roomId]);

  // ✅ 방 입장 처리 (타이머 시작 포함)
  useEffect(() => {
    if (!user || !roomId || hasJoinedRef.current) return;

    // 타임아웃 설정 (30초 후 자동으로 로딩 해제)
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.error("입장 타임아웃 - 로딩 상태 강제 해제");
        setLoading(false);
        toast({
          title: "입장 시간 초과",
          description:
            "방 입장에 시간이 너무 오래 걸립니다. 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    }, 30000);

    const joinRoom = async () => {
      try {
        setLoading(true);
        console.log("=== 방 입장 시작 ===");
        console.log("roomId:", roomId);
        console.log("user:", user);

        // 1. 방 정보 로드
        let roomData: GroupStudyRoom;
        try {
          roomData = await studyRoomAPI.getRoom(roomId);
          console.log("Room data loaded:", roomData);
          setRoomInfo(roomData);
        } catch (error: any) {
          console.error("Failed to get room info:", error);
          clearTimeout(timeoutId);
          setLoading(false);
          setError(error?.message || "방 정보를 불러올 수 없습니다.");
          toast({
            title: "오류",
            description: error?.message || "방 정보를 불러올 수 없습니다.",
            variant: "destructive",
          });
          // 에러 발생 시 3초 후 자동으로 그룹 스터디 페이지로 이동
          setTimeout(() => {
            navigate("/group-study");
          }, 3000);
          return;
        }

        // 2. 방 참여 (JWT 자동) - 500 에러는 무시하고 계속 진행
        // 방 정보가 성공적으로 로드되었으므로, join 실패해도 계속 진행
        try {
          await studyRoomAPI.joinRoom(roomId);
          console.log("Successfully joined room via API");
        } catch (joinError: any) {
          // 500 에러는 이미 참여 중이거나 중복 참여일 수 있으므로 무시하고 계속 진행
          const errorMessage = String(joinError?.message || "");
          const errorStatus = joinError?.status;

          console.log("방 참여 요청 결과 (계속 진행):", {
            message: errorMessage,
            status: errorStatus,
            error: joinError,
          });

          // 모든 에러에 대해 계속 진행 (이미 참여 중일 수 있음)
          // 방 정보가 성공적으로 로드되었으므로 입장 가능
        }

        hasJoinedRef.current = true;

        // 3. ✅ 스터디 세션 시작 연동
        try {
          const roomIdNum = parseInt(roomId, 10);
          if (!isNaN(roomIdNum)) {
            console.log("Calling sessionAPI.startSession with:", { studyType: 'GROUP_STUDY', roomId: roomIdNum });
            const sessionResponse = await sessionAPI.startSession({
              studyType: 'GROUP_STUDY',
              roomId: roomIdNum
            });
            console.log("Session API response:", sessionResponse);
            
            setSessionId(sessionResponse.sessionId);
            setIsSessionActive(true);
            setCurrentSeconds(0);
            console.log("Session state updated:", {
              sessionId: sessionResponse.sessionId,
              isSessionActive: true
            });
          } else {
            console.error("Invalid roomId:", roomId);
          }
        } catch (sessionError: any) {
          console.error("Failed to start session:", sessionError);
          console.error("Session error details:", {
            message: sessionError?.message,
            stack: sessionError?.stack
          });
          // 세션 시작 실패해도 방 입장은 계속 진행
        }

        // 4. ✅ 기존 타이머 시작 (에러가 나도 계속 진행) - 필요시 유지
        try {
          const isCreator = roomData.creatorId === Number(user.id);
          const timerResponse = await timerAPI.startTimer(
            Number(roomId),
            isCreator
          );
          setTimerStatus(timerResponse);
          console.log("Timer started:", timerResponse);
        } catch (timerError: any) {
          console.error("타이머 시작 실패:", timerError);
          // 타이머 실패해도 계속 진행
        }

        addSystemMessage(`${user.username}님이 입장했습니다.`);

        clearTimeout(timeoutId);
        console.log("=== 방 입장 완료 ===");
        console.log("roomInfo:", roomData);
        setLoading(false);

        toast({
          title: "입장 완료",
          description: `${roomData.roomName}에 입장했습니다.`,
        });
      } catch (error: any) {
        console.error("Failed to join room:", error);
        clearTimeout(timeoutId);
        setLoading(false);
        setError(error?.message || "방 입장에 실패했습니다.");
        toast({
          title: "입장 실패",
          description: error?.message || "방 입장에 실패했습니다.",
          variant: "destructive",
        });
        // 에러 발생 시 3초 후 자동으로 그룹 스터디 페이지로 이동
        setTimeout(() => {
          navigate("/group-study");
        }, 3000);
      }
    };

    joinRoom();

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomId, navigate]);

  // 브라우저 이벤트 처리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (roomId && hasJoinedRef.current && !isLeavingRef.current) {
        isLeavingRef.current = true;

        const baseURL =
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

        // ✅ 스터디 세션 종료
        if (sessionId !== null) {
          fetch(`${baseURL}/api/study-sessions/${sessionId}/end`, {
            method: "POST",
            credentials: "include",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
          }).catch((err) => console.error("Failed to end session:", err));
        }

        // ✅ 타이머 종료 (기존 timerAPI용)
        fetch(`${baseURL}/api/timer/end`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch((err) => console.error("Failed to end timer:", err));

        // 방 나가기
        const url = `${baseURL}/api/study-rooms/${roomId}/leave`;
        fetch(url, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch((err) => console.error("Failed to leave room:", err));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (roomId && hasJoinedRef.current && !isLeavingRef.current) {
        leaveRoom();
      }
    };
  }, [roomId]);

  // ✅ 방 나가기 (타이머 종료 포함)
  const leaveRoom = async () => {
    if (!roomId || isLeavingRef.current) return;
    isLeavingRef.current = true;

    try {
      // ✅ 스터디 세션 종료 연동
      if (sessionId !== null) {
        try {
          const endResult = await sessionAPI.endSession(sessionId);
          console.log("Session ended successfully:", endResult);
          
          // 레벨업 확인 및 축하 메시지
          if (endResult.leveledUp && endResult.newLevel !== null) {
            toast({
              title: "🎉 레벨업!",
              description: `축하합니다! 레벨 ${endResult.newLevel}이 되었습니다!`,
            });
          }
          
          // setInterval 정리 및 currentSeconds 초기화
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setCurrentSeconds(0);
          setSessionId(null);
          setIsSessionActive(false);
          
          // 뽀모도로 타이머 정리
          if (pomodoroIntervalRef.current) {
            clearInterval(pomodoroIntervalRef.current);
            pomodoroIntervalRef.current = null;
          }
          setPomodoroIsRunning(false);
        } catch (sessionError: any) {
          console.error("Failed to end session:", sessionError);
          // 세션 종료 실패해도 방 나가기는 계속 진행
        }
      }

      // ✅ 기존 타이머 종료 (필요시 유지)
      try {
        await timerAPI.endTimer();
        console.log("Timer ended successfully");
      } catch (timerError) {
        console.error("Failed to end timer:", timerError);
      }

      await studyRoomAPI.leaveRoom(roomId);
      hasJoinedRef.current = false;
    } catch (error) {
      console.error("Failed to leave room:", error);
      hasJoinedRef.current = false;
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

  // ✅ 상태 전환 (공부/휴식)
  const handleStatusToggle = (newStatus: "studying" | "resting") => {
    if (myStatus === newStatus) return;

    if (newStatus === "resting" && myStatus === "studying") {
      addSystemMessage(
        `${
          user?.username
        }님이 휴식 모드로 전환했습니다. (공부 시간: ${formatTime(
          currentSeconds
        )})`
      );
    } else if (newStatus === "studying" && myStatus === "resting") {
      addSystemMessage(`${user?.username}님이 공부 모드로 전환했습니다.`);
    }

    setMyStatus(newStatus);
    setParticipants((prev) =>
      prev.map((p) =>
        p.username === user?.username
          ? {
              ...p,
              timerStatus: newStatus === "studying" ? "STUDYING" : "RESTING",
            }
          : p
      )
    );
  };

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    if (isQuestionMode) {
      // 질문 메시지 전송
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "question",
        sender: user?.username || "익명",
        content: messageInput,
        imageUrl: questionImage || undefined,
        fileName: questionFileName || undefined,
        timestamp: new Date(),
        answers: [],
        status: "open",
      };

      setMessages((prev) => [...prev, newMessage]);
      addSystemMessage(
        `${user?.username}님이 질문했습니다: "${messageInput.slice(0, 30)}..."`
      );

      // 리셋
      setMessageInput("");
      setIsQuestionMode(false);
      setQuestionImage(null);
      setQuestionFileName(null);

      toast({
        title: "질문 등록",
        description: "질문이 등록되었습니다. 다른 참여자들이 답변해줄 거예요!",
      });
    } else {
      // 일반 텍스트 메시지 전송
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "text",
        sender: user?.username || "익명",
        content: messageInput,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, newMessage]);
      setMessageInput("");
    }
  };

  const addSystemMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "system",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const imageUrl = URL.createObjectURL(file);

    if (isQuestionMode) {
      // 질문 모드일 때는 첨부파일로 저장
      setQuestionImage(imageUrl);
      setQuestionFileName(file.name);
    }
  };

  // 질문에 답변 추가
  const handleSubmitAnswer = (questionId: string) => {
    const answerText = answerInputs[questionId];
    if (!answerText?.trim()) return;

    const newAnswer: HelpAnswer = {
      id: Date.now().toString(),
      answerer: user?.username || "익명",
      content: answerText,
      timestamp: new Date(),
    };

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === questionId && msg.type === "question"
          ? {
              ...msg,
              answers: [...(msg.answers || []), newAnswer],
              status: "helping" as const,
            }
          : msg
      )
    );

    // 답변 입력 초기화
    setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));

    toast({
      title: "답변 등록",
      description: "답변이 등록되었습니다!",
    });
  };

  // 답변 채택
  const handleAcceptAnswer = (questionId: string, answerId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === questionId && msg.type === "question"
          ? {
              ...msg,
              answers: msg.answers?.map((ans) =>
                ans.id === answerId ? { ...ans, isAccepted: true } : ans
              ),
              status: "resolved" as const,
            }
          : msg
      )
    );

    toast({
      title: "답변 채택 완료",
      description: "답변이 채택되어 질문이 해결되었습니다! 🎉",
    });
  };

  // 질문으로 스크롤
  const scrollToQuestion = (questionId: string) => {
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
  const handleDeleteQuestion = (questionId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== questionId));

    toast({
      title: "삭제 완료",
      description: "질문이 삭제되었습니다.",
    });
  };

  const handleExitRoom = async () => {
    if (!roomId || !roomInfo) return;

    const isCreator = user && roomInfo.creatorId === Number(user.id);

    if (isCreator) {
      const confirmExit = confirm(
        "방장이 나가면 다른 참여자에게 방장 권한이 이양되거나 방이 삭제됩니다.\n정말로 나가시겠습니까?"
      );

      if (!confirmExit) {
        setExitDialogOpen(false);
        return;
      }
    }

    await leaveRoom();
    toast({
      title: "방 나가기 완료",
      description: "스터디룸에서 나왔습니다.",
    });

    setExitDialogOpen(false);
    navigate("/group-study");
  };

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

  // 로그인 확인
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">로그인이 필요합니다.</p>
          <Button onClick={() => navigate("/login")}>로그인하기</Button>
        </div>
      </div>
    );
  }

  // roomId 확인
  if (!roomId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">방 ID가 없습니다.</p>
          <Button onClick={() => navigate("/group-study")}>
            그룹 스터디로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            오류가 발생했습니다
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-x-3">
            <Button onClick={() => navigate("/group-study")}>
              그룹 스터디로 돌아가기
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            3초 후 자동으로 그룹 스터디 페이지로 이동합니다...
          </p>
        </div>
      </div>
    );
  }

  if (loading || !roomInfo) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">스터디룸에 입장하는 중...</p>
          <p className="text-xs text-gray-400">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {roomInfo.roomName}
          </h1>
          <Badge variant="secondary">{roomInfo.studyField}</Badge>

          {/* 참여자 수 팝오버 */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                <Users className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {participants.length}/{roomInfo.maxMembers}
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
                        {participant.profileImageUrl ? (
                          <AvatarImage src={participant.profileImageUrl} />
                        ) : null}
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
                              participant.timerStatus === "STUDYING"
                                ? "bg-green-500"
                                : "bg-orange-500"
                            }`}
                          ></span>
                          <span className="text-xs text-gray-500">
                            {participant.timerStatus === "STUDYING"
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

          {/* 남은 시간 표시 */}
          {roomInfo.remainingMinutes && roomInfo.remainingMinutes > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-1" />
              <span>남은 시간: {roomInfo.remainingMinutes}분</span>
            </div>
          )}
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
        <div className="flex-1 flex flex-col min-w-0">
          {/* ✅ 상태 전환 + 타이머 */}
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
                  onClick={() => {
                    setCurrentSeconds(0);
                    toast({
                      title: "타이머 리셋",
                      description: "타이머가 00:00으로 초기화되었습니다.",
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  리셋
                </Button>
              </div>

              {/* 뽀모도로 타이머 */}
              <div className="flex items-center gap-5 ml-4 px-5 py-3 bg-white rounded-xl border border-red-100 shadow-md hover:shadow-lg transition-all duration-200">
                {/* 뽀모도로 라벨 */}
                <div className="flex flex-col items-center">
                  <span className="text-base font-semibold text-red-600 whitespace-nowrap tracking-wide uppercase">Pomodoro</span>
                  <span className="text-xs text-gray-500 font-normal">뽀모도로</span>
                </div>
                
                {/* 구분선 */}
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-red-200 to-transparent"></div>
                
                {/* 시간 표시 */}
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-mono font-semibold tabular-nums ${
                    pomodoroIsRunning
                      ? pomodoroMode === "work" ? "text-red-600" : "text-blue-500"
                      : "text-gray-400"
                  }`}>
                    {formatTime(pomodoroTime)}
                  </span>
                </div>
                
                {/* 모드 및 사이클 */}
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
                
                {/* 구분선 */}
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
                
                {/* 컨트롤 버튼 */}
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
                
                {/* 모드 선택 */}
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

              {/* ✅ 총 학습 시간 + 레벨 + 질문 개수 */}
              <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
                {/* 레벨 정보 표시 */}
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
                {/* 질문 개수 표시 - 팝오버 */}
                {messages.filter(
                  (m) => m.type === "question" && m.status !== "resolved"
                ).length > 0 && (
                  <Popover
                    open={questionListOpen}
                    onOpenChange={setQuestionListOpen}
                  >
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200 hover:shadow-md transition-all cursor-pointer">
                        <HelpCircle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-700">
                          질문{" "}
                          {
                            messages.filter(
                              (m) =>
                                m.type === "question" && m.status !== "resolved"
                            ).length
                          }
                          개
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
                            .filter(
                              (m) =>
                                m.type === "question" && m.status !== "resolved"
                            )
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
                                        {question.sender
                                          ?.charAt(0)
                                          .toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-sm">
                                      {question.sender}
                                    </span>
                                  </div>
                                  <Badge
                                    variant={
                                      question.status === "helping"
                                        ? "default"
                                        : "destructive"
                                    }
                                    className="text-xs"
                                  >
                                    {question.status === "helping"
                                      ? "답변 중"
                                      : "도움 필요"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-800 line-clamp-2 mb-1">
                                  "{question.content}"
                                </p>
                                {question.answers &&
                                  question.answers.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-blue-600">
                                      <MessageCircle className="w-3 h-3" />
                                      <span>
                                        답변 {question.answers.length}개
                                      </span>
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
                  <span>총 {formatTime(currentSeconds)}</span>
                </div>
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
                {message.type === "system" ? (
                  <div className="text-center text-sm text-gray-500 py-2">
                    {message.content}
                  </div>
                ) : message.type === "question" ? (
                  // 질문 메시지
                  <div
                    id={`question-${message.id}`}
                    className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500 space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <Avatar className="w-8 h-8">
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
                            {message.timestamp.toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
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

                    {/* 질문 내용 */}
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <HelpCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-gray-900 flex-1">
                          {message.content}
                        </p>
                      </div>
                    </div>

                    {/* 첨부 이미지 */}
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

                    {/* 채택된 답변 (해결된 경우) */}
                    {message.status === "resolved" &&
                      message.answers &&
                      message.answers.some((ans) => ans.isAccepted) && (
                        <div className="pl-7 space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                            <CheckCircle className="w-4 h-4" />
                            <span>채택된 답변</span>
                          </div>
                          {message.answers
                            .filter((ans) => ans.isAccepted)
                            .map((answer) => (
                              <div
                                key={answer.id}
                                className="bg-green-50 rounded-lg p-3 border-2 border-green-300 shadow-sm"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarFallback className="bg-green-500 text-white text-xs">
                                      {answer.answerer.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm">
                                    {answer.answerer}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-green-100 text-green-700"
                                  >
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

                    {/* 답변 목록 (해결되지 않은 경우) */}
                    {message.status !== "resolved" &&
                      message.answers &&
                      message.answers.length > 0 && (
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
                                {/* 질문 작성자만 채택 버튼 표시 */}
                                {message.sender === user?.username && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() =>
                                      handleAcceptAnswer(message.id, answer.id)
                                    }
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

                    {/* 답변 입력 (해결되지 않은 경우만) */}
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
                  // 일반 메시지
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-8 h-8">
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
                          {message.timestamp.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
                        <p className="text-gray-900">{message.content}</p>
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
            {/* 질문 모드 표시 */}
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
                  value={`${window.location.origin}/#/group-study/room/${roomId}`}
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
              정말로 스터디룸을 나가시겠습니까?
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

export default GroupStudyRoomPage;
