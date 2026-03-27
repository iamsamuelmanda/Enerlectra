import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Mail, Lock, User, LogIn, AlertCircle } from 'lucide-react';
import { GoogleSignIn } from '../features/auth/components/GoogleSignIn';
import { TruthHeader } from '../components/layout/TruthHeader';

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 chars'),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormData) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: data.fullName } },
      });
      if (error) throw error;
      navigate('/signin?registered=true');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-[#0a0a0c]">
      <div className="w-full max-w-md">
        <TruthHeader />
        <Card variant="glass" padding="lg" className="w-full rounded-t-none border-t-0 border-white/10">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">Join the Grid</h1>
          </div>

          <GoogleSignIn />

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-[#121216] px-2 text-gray-500 font-mono">Or Register Email</span></div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input {...register('fullName')} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none" placeholder="Full Name" />
            <input {...register('email')} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none" placeholder="Email" />
            <input {...register('password')} type="password" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none" placeholder="Password" />
            <input {...register('confirmPassword')} type="password" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none" placeholder="Confirm Password" />
            
            <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg transition-all">
              {loading ? 'Creating...' : 'Initialize Account'}
            </button>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link to="/signin" className="text-purple-400 hover:text-purple-300">Already have an account? Sign in</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}