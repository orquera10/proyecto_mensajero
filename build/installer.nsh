!macro customInstall
  # 1. Configurar inicio automático con Windows en segundo plano (--hidden)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Mensajero Institucional" '"$INSTDIR\Mensajero Institucional.exe" --hidden'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Mensajero Institucional" '"$INSTDIR\Mensajero Institucional.exe" --hidden'

  # 2. Iniciar la aplicación inmediatamente en segundo plano apenas termine la instalación
  ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\Mensajero Institucional.exe" "open" "--hidden"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Mensajero Institucional"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Mensajero Institucional"
!macroend
