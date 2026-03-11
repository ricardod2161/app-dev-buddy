import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full min-h-[400px] p-6">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle className="text-base text-foreground">
                {this.props.fallbackTitle ?? 'Algo deu errado'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground font-mono bg-muted rounded-md px-3 py-2 text-left break-all">
                  {this.state.error.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Ocorreu um erro inesperado nesta página. As demais partes do app continuam funcionando normalmente.
              </p>
              <Button onClick={this.handleRetry} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
