import React, {useEffect , useState, useContext} from 'react';
import Button from '../../shared/components/FormElements/Button';
import Input from '../../shared/components/FormElements/Input';
import Card from  '../../shared/components/UIElements/Card';
import Modal from '../../shared/components/UIElements/Modal';
import LoadingSpinner from '../../shared/components/UIElements/LoadingSpinner';
import {VALIDATOR_REQUIRE, VALIDATOR_MINLENGTH} from '../../shared/util/validators';
import { useForm } from '../../shared/hooks/form-hook';
import { useHttpClient } from '../../shared/hooks/http-hook';
import { AuthContext } from '../../shared/context/auth-context';
import './styling/ToDoItemModal.css';

const ToDoItemModal = props => {
    const auth = useContext(AuthContext);
    const uid = auth.UID;
    const {isLoading, error, sendRequest, clearError} = useHttpClient();
    const [timeDependent,setTimeDependent] = useState(false);
    const[addressDependent,setAddressDependent] = useState(false);
    const[recurringDependent,setRecurringDependent]=useState(false)
    const[loadedItem,setLoadedItem]= useState(false)
    
    const [formState, inputHandler, setFormData] = useForm({
      name: {
        value: '',
        isValid: false
      },
      priority: {
        value: 1,
        isValid: true
      },
      status: {
        value: 'Pending',
        isValid: true
      },
      // ...(addressDependent) && {address: {
      //   value: '',
      //   isValid: false
      // }},

      notes: {
        value: '',
        isValid: false
      },
      // ...(recurringDependent) && {recurring: {
      //   value: {
      //       value:false,
      //       time:'',//days?
      //       category:'',
      //   },
      //   isValid: true
      // }},
      // ...(timeDependent) && {due: {
      //   value: {
      //       date:'',
      //       time:''
      //   },
      //   isValid: true
      // }},
    },false);

    const handleError = error =>{
      props.onError(error);
    }
    useEffect( ()=>{
      const fetchItem = async ()=>{
        if(!loadedItem || props.taskId!==loadedItem.id){  //using the fact that  with || statements if the first condition is true it will move on before it trys second
          try { 
            let responseData
            responseData = await sendRequest(`http://localhost:5000/api/todo/getitem/${props.taskId}`);
            console.log("updating")
            setLoadedItem(responseData.task);
            if(loadedItem.due){setTimeDependent(true)}
            if(loadedItem.address){setAddressDependent(true)}
            if(loadedItem.recurring){setRecurringDependent(true)}
            console.log(responseData)
          }
          catch(err){
            console.log(err)
            handleError(err);
          }
            
        }
        setFormData({
          name: {
              value: loadedItem.name,
              isValid: true
            },
            priority: {
              value: loadedItem.priority,
              isValid: true
            },
            status: {
              value: loadedItem.status,
              isValid: true
            },
            // ...(loadedItem.address) && {address: {
            //   value: loadedItem.address,
            //   isValid: true
            // }},
            notes: {
              value: loadedItem.notes,
              isValid: true
            },
            // ...(loadedItem.due) && {due: {
            //   value: {
            //       date:loadedItem.due.date,
            //       time:loadedItem.due.time
            //   },
            //   isValid: true
            // }},
      },true);
      };
      if(!props.newItem){fetchItem();}
      
  },[sendRequest,setFormData,props.taskId])//eslint-disable-line

  
    const selectTimeHandler = event =>{
      event.preventDefault();
      setTimeDependent(timeDependent?false:true)
      setRecurringDependent(false);
    }
    const selectAddressHandler = event =>{
      event.preventDefault();
      setAddressDependent(addressDependent?false:true)
      
    }
    const recurringHandler = event =>{
      event.preventDefault();
      setRecurringDependent(recurringDependent?false:true)
    }

    const editToDoSubmitHandler = async event =>{
        event.preventDefault();
        try {
          await sendRequest(
              `http://localhost:5000/api/todo/edititem/${props.taskId}`,
              'PATCH',
              JSON.stringify({
                name: formState.inputs.name.value,
                status: formState.inputs.status.value,
                priority: formState.inputs.priority.value,
                address: formState.inputs.address.value,
                notes: formState.inputs.notes.value,
              }),
              {'Content-Type': 'application/json'}
            );
            props.submitted();//!--lets parent know its submitted and changes so it can update task
        }
        catch(err){
          //handleError(err);
          console.log(err)
        }
        
    }

    const newToDoSubmitHandler = async event =>{
      event.preventDefault();
      try {
        await sendRequest(
            `http://localhost:5000/api/todo/createItem`,
            'POST',
            JSON.stringify({
              name: formState.inputs.name.value,
              status: "Pending",
              priority: formState.inputs.priority.value,
              address: formState.inputs.address.value,
              notes: formState.inputs.notes.value,
              cid: props.category.name,
              uid:uid
            }),
            {'Content-Type': 'application/json'}
          );
          props.submitted();//!lets parent know which item was submitted so it can update page of tasks
      }
      catch(err){
        //handleError(err);
        console.log(err)
      } 
    }
    const handleClear = () =>
    {
      props.onClear();
    }
return(<React.Fragment>
    {isLoading&&
            <div className = "center">
                <LoadingSpinner/>    
            </div>}
    
    {(!isLoading && (props.newItem||loadedItem.id===props.taskId)) &&  <Modal
      onCancel={handleClear} 
      header={`${props.category.name} - ${(!props.newItem)? `Editing "${loadedItem.name}"`:"New Task" }`} 
      show={props.open}
      footer={<React.Fragment>
          <Button onClick={handleClear}>Cancel</Button>
          <Button type="submit" onClick = {props.newItem?newToDoSubmitHandler:editToDoSubmitHandler} disabled={!formState.isValid}> Submit </Button> </React.Fragment>}
    >
      <form id ="toDoItemModal__form" >
        <Input id="name" element="input" type ="text" label="Name" validators={[VALIDATOR_REQUIRE()]} errorText = "Please enter a valid task name." onInput={inputHandler} initialValue = {props.newItem?"": loadedItem.name}/>
        <Input id="priority" element="input" type = "range" min="1" max ="5" validators={[VALIDATOR_REQUIRE()]} label={`Priority - ${formState.inputs.priority.value}`}  onInput={inputHandler} initialValue = {props.newItem?1: loadedItem.priority}/>
        <Button onClick = {selectTimeHandler} > {timeDependent?"Remove Date":"Set Date" }</Button>
        {(timeDependent) && <Input id="date" element="date" type = "date" label="Date"  onInput={inputHandler} validators={[VALIDATOR_REQUIRE()]} errorText = "Please select a date if it is due." initialValue = {(props.newItem || !loadedItem.due)?"": loadedItem.due.date}/> }
        {(timeDependent) && <Input id="time" element="time" type = "time" label="Time"  onInput={inputHandler} validators={[VALIDATOR_REQUIRE()]} errorText = "Please select a time if it is due."initialValue = {(props.newItem || !loadedItem.due)?"": loadedItem.due.time}/>}
        {(timeDependent) && <Button onClick = {recurringHandler} > {recurringDependent?"Stop Recurring":"Make Recurring" }</Button> }
        {(timeDependent && !recurringDependent) && <React.Fragment><br/><br/></React.Fragment>}
        {(recurringDependent) && <Input id="reccuring" element="time" type = "time" label="Recurring Time"  onInput={inputHandler} validators={[VALIDATOR_REQUIRE()]} errorText = "Please select a recurring time." initialValue = {(props.newItem )?"": loadedItem.recurring}/>}
        <Button onClick = {selectAddressHandler} > {addressDependent?"Remove Address":"Set Address" }</Button>
        {(addressDependent) && <Input id="address" element="input" label="Address" validators={[VALIDATOR_REQUIRE()]} errorText = "Please enter a valid address." onInput={inputHandler} initialValue = {(props.newItem)?"": loadedItem.address}/>}
        <Input id="notes" element="textarea" label="Notes" validators={[VALIDATOR_MINLENGTH(5)]} errorText = "Please enter a valid description (at least 5 characters)." onInput={inputHandler} initialValue = {(props.newItem)?"": loadedItem.notes}/>
      </form>
    </Modal>}
</React.Fragment>)
};

export default ToDoItemModal;