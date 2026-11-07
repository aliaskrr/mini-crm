import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthContext.ts'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { AppLayout } from './components/AppLayout.tsx'
import { NotFound } from './components/NotFound.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { ObjectPage } from './pages/ObjectPage.tsx'
import { ObjectsPage } from './pages/ObjectsPage.tsx'
import { TaskPage } from './pages/TaskPage.tsx'
import { TasksPage } from './pages/TasksPage.tsx'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:objectId" element={<ObjectPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

/** Стартовый экран: постановщику — объекты, исполнителю — его задачи. */
function HomeRedirect() {
  const { isManager } = useAuth()
  return <Navigate to={isManager ? '/objects' : '/tasks'} replace />
}
