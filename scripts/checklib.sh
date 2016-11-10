#!/bin/bash

python -c "from envirophat import *" 2> /dev/null

if [ $? -ne 0 ]
then
    echo "WARNING : Can't find enviro phat python library"
    echo "WARNING : Please install using the following commands"
    echo "WARNING : sudo curl -sS get.pimoroni.com/envirophat | bash"
else
    echo "enviro phat python library is installed"
fi
