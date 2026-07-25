import NextAuth, { NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authConfig: NextAuthConfig = {
  secret: 'my-super-secret-key-that-is-at-least-32-chars-long-for-next-auth',
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        if (password !== 'demo1234') return null;

        if (email === 'pm@ecms.app') {
          return { id: "1", name: "Project Manager", email, role: "pm" };
        }
        if (email === 'supervisor@ecms.app') {
          return { id: "2", name: "Site Supervisor", email, role: "supervisor" };
        }
        if (email === 'store@ecms.app') {
          return { id: "3", name: "Storekeeper", email, role: "storekeeper" };
        }

        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.role = token.role as string;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
