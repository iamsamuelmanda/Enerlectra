export interface SignInFormData {
    email: string;
    password: string;
  }
  
  export interface SignUpFormData {
    email: string;
    password: string;
    confirmPassword: string;
    fullName: string;
  }
  
  export interface AuthError {
    message: string;
    status?: number;
  }