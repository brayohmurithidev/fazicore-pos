import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router"
import { ShieldCheck, Loader2 } from "lucide-react"
import axios from "axios"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FormError } from "@/components/shared"

const schema = z.object({
  email:    z.string().email("Invalid email"),
  password: z.string().min(1, "Required"),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const isAuth    = useAuthStore((s) => s.isAuthenticated)

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) })

  if (isAuth) {
    navigate("/dashboard", { replace: true })
    return null
  }

  async function onSubmit(data: FormData) {
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? ""
      const res = await axios.post(`${baseUrl}/api/v1/admin/auth/login`, data)
      setAuth(res.data.access_token, res.data.full_name)
      navigate("/dashboard", { replace: true })
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? "Invalid credentials."
        : "An unexpected error occurred."
      setError("root", { message: msg })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-zinc-900">Fazicore Admin</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Platform administration</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field label="Email address" error={errors.email?.message} required>
              <Input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="admin@fazilabs.com"
              />
            </Field>

            <Field label="Password" error={errors.password?.message} required>
              <Input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            <FormError message={errors.root?.message} />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
            >
              {isSubmitting && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
