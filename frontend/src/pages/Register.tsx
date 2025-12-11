import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye, EyeOff, Camera, X } from "lucide-react";
import Navbar from "@/components/Navbar";

const STUDY_FIELDS = [
  "프로그래밍",
  "영어",
  "자격증",
  "공무원",
  "대학입시",
  "취업준비",
  "어학",
  "기타",
];

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    bio: "",
    studyFields: [] as string[],
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStudyFieldChange = (field: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      studyFields: checked
        ? [...prev.studyFields, field]
        : prev.studyFields.filter((f) => f !== field),
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("이미지 크기는 5MB를 초과할 수 없습니다.");
        return;
      }

      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 업로드 가능합니다.");
        return;
      }

      setProfileImage(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    setImagePreview("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (formData.studyFields.length === 0) {
      alert("공부 분야를 최소 1개 선택해주세요.");
      return;
    }

    setLoading(true);

    try {
      // ✅ FormData로 전송 (프로필 이미지 포함)
      const formDataToSend = new FormData();
      formDataToSend.append("email", formData.email.trim());
      formDataToSend.append("username", formData.username.trim());
      formDataToSend.append("password", formData.password);
      formDataToSend.append("checkPassword", formData.confirmPassword);
      formDataToSend.append("studyField", formData.studyFields[0]);
      formDataToSend.append("checkPw", "true");

      if (formData.bio.trim()) {
        formDataToSend.append("bio", formData.bio.trim());
      }

      // ✅ 프로필 이미지 추가
      if (profileImage) {
        formDataToSend.append("profileImageFile", profileImage);
      }

      console.log("📤 회원가입 데이터 전송 (FormData)");
      console.log("- Email:", formData.email);
      console.log("- Username:", formData.username);
      console.log("- StudyField:", formData.studyFields[0]);
      console.log("- ProfileImage:", profileImage ? profileImage.name : "없음");

      const success = await register(formDataToSend);
      
      if (success) {
        setLoading(false);
        alert("회원가입이 완료되었습니다!");
        navigate("/login");
      } else {
        setLoading(false);
      }
    } catch (error: any) {
      setLoading(false);

      console.error("=== 회원가입 에러 ===");
      console.error(error);

      let errorMessage = "회원가입에 실패했습니다.";

      if (error?.message) {
        errorMessage = error.message;
        errorMessage = errorMessage
          .replace(/HTTP error! status: \d+\s*/g, "")
          .trim();
      }

      alert(`회원가입 실패\n\n${errorMessage}`);
    }
  };

  const isFormValid =
    formData.username.length >= 2 &&
    formData.username.length <= 12 &&
    formData.email &&
    formData.password.length >= 8 &&
    formData.password === formData.confirmPassword &&
    formData.studyFields.length > 0 &&
    formData.studyFields.length <= 5;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              회원가입
            </CardTitle>
            <CardDescription className="text-center">
              새 계정을 만들어 스터디를 시작하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 프로필 이미지 업로드 */}
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={imagePreview} />
                    <AvatarFallback className="text-2xl bg-gray-200">
                      {formData.username
                        ? formData.username.charAt(0).toUpperCase()
                        : "?"}
                    </AvatarFallback>
                  </Avatar>

                  {imagePreview && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="text-center">
                  <Label
                    htmlFor="profile-image"
                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    프로필 이미지 선택
                  </Label>
                  <Input
                    id="profile-image"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    JPG, PNG (최대 5MB)
                  </p>
                  {profileImage && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      ✓ {profileImage.name} ({(profileImage.size / 1024).toFixed(1)}KB)
                    </p>
                  )}
                </div>
              </div>

              {/* 이메일 */}
              <div className="space-y-2">
                <Label htmlFor="email">이메일 (로그인 ID) *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
                <p className="text-xs text-gray-500">
                  이메일은 로그인 시 사용됩니다.
                </p>
              </div>

              {/* 닉네임 */}
              <div className="space-y-2">
                <Label htmlFor="username">닉네임 *</Label>
                <Input
                  id="username"
                  name="username"
                  placeholder="2-12자 이내"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  minLength={2}
                  maxLength={12}
                />
                <p className="text-xs text-gray-500">
                  닉네임은 다른 사용자에게 표시됩니다.
                </p>
              </div>

              {/* 비밀번호 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">비밀번호 *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="최소 8자, 영문+숫자"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      minLength={8}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">비밀번호 확인 *</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="비밀번호를 다시 입력하세요"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* 공부 분야 */}
              <div className="space-y-2">
                <Label>관심 공부 분야 * (최소 1개, 최대 5개)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {STUDY_FIELDS.map((field) => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={field}
                        checked={formData.studyFields.includes(field)}
                        onCheckedChange={(checked) =>
                          handleStudyFieldChange(field, checked as boolean)
                        }
                        disabled={
                          !formData.studyFields.includes(field) &&
                          formData.studyFields.length >= 5
                        }
                      />
                      <Label htmlFor={field} className="text-sm">
                        {field}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 자기소개 */}
              <div className="space-y-2">
                <Label htmlFor="bio">자기소개 (최대 200자)</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  placeholder="자신을 소개해주세요"
                  value={formData.bio}
                  onChange={handleInputChange}
                  maxLength={200}
                  rows={3}
                />
                <p className="text-xs text-gray-500 text-right">
                  {formData.bio.length}/200
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !isFormValid}
              >
                {loading ? "가입 중..." : "회원가입"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                이미 계정이 있으신가요?{" "}
                <Link
                  to="/login"
                  className="text-blue-600 hover:underline font-medium"
                >
                  로그인
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;